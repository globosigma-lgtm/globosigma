const BASE = "/api";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });
  const isJson = res.headers.get("content-type")?.includes("application/json");
  const body = isJson ? await res.json() : null;
  if (!res.ok) {
    throw new ApiError(body?.erro ?? "Erro inesperado ao comunicar com o servidor.", res.status);
  }
  return body as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: "GET" }),
  post: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: "POST", body: data ? JSON.stringify(data) : undefined }),
  put: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: "PUT", body: data ? JSON.stringify(data) : undefined }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  // DADOS-02: upload de anexo — não pode forçar Content-Type: application/json (o navegador
  // precisa definir o boundary do multipart sozinho), então não passa pelo request() genérico.
  upload: async <T>(path: string, formData: FormData): Promise<T> => {
    const res = await fetch(`${BASE}${path}`, { method: "POST", credentials: "include", body: formData });
    const isJson = res.headers.get("content-type")?.includes("application/json");
    const body = isJson ? await res.json() : null;
    if (!res.ok) {
      throw new ApiError(body?.erro ?? "Erro inesperado ao comunicar com o servidor.", res.status);
    }
    return body as T;
  },
};
