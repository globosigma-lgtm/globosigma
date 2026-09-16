import type { NextFunction, Request, Response } from "express";

/**
 * Express 4 não captura promises rejeitadas de handlers async automaticamente (isso só chega no
 * Express 5) — sem isso, um erro dentro de um handler `async` fica pendurado em vez de cair no
 * error handler central (server/src/app.ts).
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
