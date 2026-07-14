import { createApp } from "./app.js";
import { createDb } from "./db/connection.js";
import { migrate } from "./db/schema.js";

const port = Number(process.env.PORT ?? 3000);
const db = createDb();
migrate(db);

const app = createApp(db);

app.listen(port, () => {
  console.log(`Workflow engine listening on http://localhost:${port}`);
});
