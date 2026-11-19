import { prepareDatabaseRun } from "./commands.mjs";
import { checksFolderUnlessJudged, migrationFiles, realSurroundings } from "./cli.mjs";

export default async function setup(project) {
  const around = { ...realSurroundings(), say: () => {} };
  const where = await prepareDatabaseRun(around, migrationFiles(), checksFolderUnlessJudged());
  project.provide("practiceCopy", { address: where.address, publicKey: where.publicKey, inbox: where.inbox });
}
