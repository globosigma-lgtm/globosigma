import { createApp } from "./app.js";

const PORT = process.env.PORT ? Number(process.env.PORT) : 3333;

createApp().then((app) => {
  app.listen(PORT, () => {
    console.log(`SIGMA API rodando em http://localhost:${PORT}`);
  });
});
