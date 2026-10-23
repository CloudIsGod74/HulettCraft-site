/// <reference types="astro/client" />
declare namespace App {
  interface Locals {
    runtime: { env: import("./lib/runtime").Env };
    applicationScope?: string;
  }
}
