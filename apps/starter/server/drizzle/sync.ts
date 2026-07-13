import { isRemote, orm } from "./db";

async function sync() {
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
