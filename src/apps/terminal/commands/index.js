// Command registry: every command the terminal knows about.
import { c } from "../shell.js";
import { coreCommands } from "./core.js";
import { desktopCommands } from "./desktop.js";
import { portfolioCommands } from "./portfolio.js";
import { funCommands } from "./fun.js";

const NO_HELP_FLAG = new Set(["echo", "printf", "true", "false", "help", "man", "curl"]);

/** `cmd --help` prints the synopsis and options for every command. */
function withHelp(name, def) {
  if (NO_HELP_FLAG.has(name)) return def;
  return {
    ...def,
    run(ctx) {
      if (ctx.args[0] === "--help") {
        ctx.print("Usage: ", c.bold(def.usage || name));
        if (def.desc) ctx.print(def.desc.charAt(0).toUpperCase() + def.desc.slice(1) + ".");
        if (def.opts?.length) {
          ctx.print("");
          const w = Math.max(...def.opts.map(([f]) => f.length)) + 2;
          for (const [flag, text] of def.opts) ctx.print("  ", c.bold(flag.padEnd(w)), text);
        }
        return 0;
      }
      return def.run(ctx);
    },
  };
}

const all = { ...coreCommands, ...desktopCommands, ...portfolioCommands, ...funCommands };
export const COMMANDS = Object.fromEntries(
  Object.entries(all)
    .filter(([, def]) => def)
    .map(([name, def]) => [name, withHelp(name, def)])
);
