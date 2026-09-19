#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  ContentUnsupportedError,
  runLupa,
  supportsContent,
  supportsFolders,
} from "./cli.js";

/**
 * 검색 문법 치트시트.
 *
 * Claude Code 플러그인은 이걸 스킬 파일로 가르치지만, 다른 MCP 클라이언트에는
 * 스킬이 없다. 그래서 도구 설명에 직접 넣는다 — 어느 클라이언트에서든 모델이
 * 자연어를 이 문법으로 옮길 수 있게.
 */
const QUERY_SYNTAX = `Query syntax (combine freely; more conditions = sharper results):
  word1 word2      files matching ALL words rank first (grouped by match count)
  n:word           file name only        (aliases: name:, 이름:, 파일명:, 文件名:)
  c:word           document content only (aliases: content:, 내용:, 内容:)
  f:word           folder path contains  (aliases: 폴더:, 文件夹:)
  -word            exclude
  "exact phrase"   literal match, no stemming
  .pdf  *.mp3  report*     extension / wildcard
  kind:document    kind filter — document, pdf, hwp, image, video, audio, code, archive, app
  size:>10mb  size:<1mb
  date:today  date:week  date:month  date:7d  date:2026-06
Korean and Chinese prefixes work too (종류:, 크기:, 날짜: / 种类:, 大小:, 日期:).
Korean is handled properly: partial words inside compounds and attached particles
("보호정책" finds "정보보호정책서.hwp"; "심사보고서를" finds "심사보고서").`;

const server = new McpServer({ name: "lupa", version: "0.1.0" });

/** 토큰을 아끼려고 필요한 필드만 남긴다. 에이전트는 경로·이름·근거만 있으면 된다. */
function trimResult(row, snippetChars) {
  const out = {
    path: row.path,
    name: row.name,
    kind: row.kind,
    modified: (row.modified || "").slice(0, 10),
    size_kb: Math.round((row.size_bytes || 0) / 1024),
  };
  if (row.matched_keywords > 1) out.matched_keywords = row.matched_keywords;
  const snippet = (row.snippet || "").trim();
  if (snippet) {
    out.snippet =
      snippet.length > snippetChars ? snippet.slice(0, snippetChars) + "…" : snippet;
  }
  return out;
}

server.registerTool(
  "lupa_search",
  {
    title: "Search files on this Mac",
    description:
      "Find files on this Mac by file name AND by what is written inside documents " +
      "(PDF, Word, Excel, PowerPoint, Hangul HWP/HWPX, plain text, and scanned PDFs " +
      "read with OCR). Searches Lupa's local index, so it answers in ~30ms and never " +
      "touches the network. Prefer this over find/grep/mdfind for locating files.\n\n" +
      "Returns ranked paths with a matching snippet. To read a file's text afterwards, " +
      "use lupa_read — it returns the indexed text without opening the file.\n\n" +
      QUERY_SYNTAX,
    inputSchema: {
      query: z.string().min(1).describe("Search query. Use the syntax above."),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .default(10)
        .describe("How many results to return (default 10, max 50)."),
      names_only: z
        .boolean()
        .default(false)
        .describe("Search file names only, ignoring document contents. Faster."),
      snippet_chars: z
        .number()
        .int()
        .min(0)
        .max(500)
        .default(160)
        .describe("Truncate each snippet to this many characters (0 = no snippets)."),
    },
  },
  async ({ query, limit, names_only, snippet_chars }) => {
    const args = [query, "--limit", String(limit)];
    if (names_only) args.push("--names-only");

    const data = await runLupa(args);
    const results = (data.results || []).map((row) => trimResult(row, snippet_chars));

    const summary = {
      query: data.query,
      total_matches: data.total_matches,
      returned: results.length,
      elapsed_ms: data.elapsed_ms,
      results,
    };
    if (data.total_matches_capped) summary.total_matches_capped = true;
    if (results.length === 0) {
      summary.hint =
        "No matches. Try fewer or shorter words, drop filters, or check that the " +
        "folder containing the file is registered in the Lupa app.";
    }
    return { content: [{ type: "text", text: JSON.stringify(summary, null, 1) }] };
  }
);

server.registerTool(
  "lupa_read",
  {
    title: "Read a file's indexed text",
    description:
      "Return the text Lupa already extracted from a file, without opening the file " +
      "itself. Works for PDF, Word, Excel, PowerPoint, Hangul HWP/HWPX and scanned " +
      "documents that were OCR'd. Use this after lupa_search when you need the actual " +
      "content — it is far cheaper than reading the original file, and it works even " +
      "for formats you cannot parse.\n\n" +
      "Note: only the beginning of each document is indexed, so very long files are " +
      "truncated. If the file has no indexed text (image-only, password-protected, or " +
      "not yet content-indexed), this reports that instead.",
    inputSchema: {
      path: z
        .string()
        .min(1)
        .describe("Absolute file path, exactly as returned by lupa_search."),
      max_chars: z
        .number()
        .int()
        .min(0)
        .max(100_000)
        .default(8_000)
        .describe("Maximum characters to return (default 8000, 0 = no limit)."),
    },
  },
  async ({ path, max_chars }) => {
    if (!(await supportsContent())) throw new ContentUnsupportedError();
    const data = await runLupa(["--content", path, "--max-chars", String(max_chars)]);
    const truncated = data.total_chars > data.chars;
    const header =
      `${path}\n${data.chars} of ${data.total_chars} indexed characters` +
      (truncated ? " (truncated — raise max_chars for more)" : "") +
      "\n\n";
    return { content: [{ type: "text", text: header + (data.content || "") }] };
  }
);

await server.connect(new StdioServerTransport());
