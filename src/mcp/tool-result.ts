import { DataApiError } from "../data-api/error.js";

export class ToolInputError extends Error {
  readonly code: string;
  readonly hint: string;

  constructor(code: string, message: string, hint = "fix_arguments") {
    super(message);
    this.name = "ToolInputError";
    this.code = code;
    this.hint = hint;
  }
}

export async function runTool<T extends object>(operation: () => Promise<T>) {
  try {
    const structuredContent = await operation();
    return {
      content: [{ type: "text" as const, text: JSON.stringify(structuredContent) }],
      structuredContent,
    };
  } catch (error) {
    const publicError = publicToolError(error);
    return {
      isError: true,
      content: [{ type: "text" as const, text: JSON.stringify({ error: publicError }) }],
    };
  }
}

function publicToolError(error: unknown): Record<string, unknown> {
  if (error instanceof ToolInputError) {
    return {
      code: error.code,
      message: error.message,
      retryable: false,
      agent_action_hint: error.hint,
    };
  }
  if (error instanceof DataApiError) {
    return {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      ...(error.status === undefined ? {} : { status: error.status }),
      ...(error.requestId === undefined ? {} : { request_id: error.requestId }),
    };
  }
  return {
    code: "internal_error",
    message: "Dataline could not complete the tool call.",
    retryable: false,
  };
}
