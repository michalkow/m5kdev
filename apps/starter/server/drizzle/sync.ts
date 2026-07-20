import { isRemote, orm } from "./db";
import { ensureDevServerStopped } from "./guard";

async function sync() {
  await ensureDevServerStopped();
  if (isRemote) {
    await orm.$client.sync();
  } else {
    console.info("Local database no sync required");
  }
}

sync().then(() => {
  console.info("Sync completed");
  process.exit(0);
});
