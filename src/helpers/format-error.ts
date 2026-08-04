import { AxiosError } from "axios";

interface XeroValidationError {
  Message?: string;
}

interface XeroElement {
  ValidationErrors?: XeroValidationError[];
}

interface XeroErrorResponse {
  Detail?: string;
  Elements?: XeroElement[];
}

interface XeroSdkProblem {
  title?: string;
  detail?: string;
  status?: number;
}

interface XeroSdkError {
  response: {
    statusCode: number;
    body?: {
      httpStatusCode?: string;
      problem?: XeroSdkProblem;
      Detail?: string;
    };
  };
}

/**
 * Extract validation error messages from Xero API response
 */
function extractValidationErrors(data: XeroErrorResponse): string | null {
  const validationErrors = data?.Elements?.[0]?.ValidationErrors;
  if (validationErrors && validationErrors.length > 0) {
    return validationErrors
      .map((ve) => ve.Message)
      .filter(Boolean)
      .join("; ");
  }
  return null;
}

function isXeroSdkError(error: unknown): error is XeroSdkError {
  if (typeof error !== "object" || error === null) return false;
  const response = (error as { response?: unknown }).response;
  if (typeof response !== "object" || response === null) return false;
  return typeof (response as { statusCode?: unknown }).statusCode === "number";
}

function formatHttpStatus(status: number): string {
  switch (status) {
    case 401:
      return "Authentication failed. Please check your Xero credentials.";
    case 403:
      return "You don't have permission to access this resource in Xero.";
    case 404:
      return "The requested resource was not found in Xero.";
    case 429:
      return "Too many requests to Xero. Please try again in a moment.";
    default:
      return "";
  }
}

/**
 * Format error messages for return to the LLM.
 *
 * Never stringify unknown error objects — the xero-node SDK rejects with a
 * plain object whose `request.headers.authorization` field contains the
 * caller's Bearer token. Whitelist the fields we extract so secrets never
 * reach the response.
 */
export function formatError(error: unknown): string {
  if (error instanceof AxiosError) {
    const status = error.response?.status;
    const data = error.response?.data as XeroErrorResponse | undefined;
    const detail = data?.Detail;

    if (status === 400) {
      const validationMessage = data ? extractValidationErrors(data) : null;
      return (
        validationMessage ||
        detail ||
        "Validation error from Xero. Please check your input."
      );
    }

    if (status !== undefined) {
      const mapped = formatHttpStatus(status);
      if (mapped) return mapped;
    }
    return detail || "An error occurred while communicating with Xero.";
  }

  if (isXeroSdkError(error)) {
    const status = error.response.statusCode;
    const mapped = formatHttpStatus(status);
    if (mapped) return mapped;

    const body = error.response.body;
    const problem = body?.problem;
    const title = problem?.title ?? body?.httpStatusCode ?? "HTTP error";
    const detail = problem?.detail ?? body?.Detail;
    return detail ? `${status} ${title}: ${detail}` : `${status} ${title}`;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "An unexpected error occurred while communicating with Xero.";
}
