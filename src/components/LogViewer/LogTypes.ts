export type LogLevel = "TRACE" | "DEBUG" | "INFO" | "WARN" | "ERROR" | "OTHER";

export type LogLine = {
  id: string; // unique: fileName:index
  fileName: string;
  lineNumber: number;
  content: string;
  level: LogLevel;
};

export type ParsedFile = {
  fileName: string;
  lines: LogLine[];
  totalLines: number;
};

export type FilterMode = "text" | "regex";

export type FilterConfig = {
  query: string;
  mode: FilterMode;
  caseSensitive: boolean;
  level: "ALL" | LogLevel;
};