import { Bot } from "grammy";
import { registerMenus } from "./features/menus.js";

export function createBot(token) {
  const bot = new Bot(token);

  // Commands are registered via src/commands/loader.js in src/index.js
  // Callback handlers that act like “features” are registered here.
  registerMenus(bot);

  return bot;
}
