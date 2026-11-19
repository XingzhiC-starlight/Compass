import { aroundEach, vi } from "vitest";
import { MAIN_FOLDER, blockNetwork, holdEachCheck } from "./lib.mjs";

if (process.cwd() !== MAIN_FOLDER) process.chdir(MAIN_FOLDER);

blockNetwork();

holdEachCheck("suite", { aroundEach, vi });
