import { apiOptions, apiResponse } from "@/lib/question-api";

export const OPTIONS = apiOptions;

export function POST(request: Request): Response {
  return apiResponse(request, {
    error: "旧问号服务已停止，请将 CC98 Reborn 更新到 0.3.5.2 或更高版本。",
    newUrl: "https://question.coranqwq.xyz",
  }, 410);
}
