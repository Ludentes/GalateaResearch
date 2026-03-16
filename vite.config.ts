import tailwindcss from "@tailwindcss/vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact from "@vitejs/plugin-react"
import { nitro } from "nitro/vite"
import { defineConfig } from "vite"
import tsConfigPaths from "vite-tsconfig-paths"

const noWatch = !!process.env.NO_WATCH

export default defineConfig({
  server: {
    port: 13000,
    watch: noWatch
      ? { ignored: ["**"] }
      : {
          ignored: [
            "**/data/**",
            "**/graphiti/**",
            "**/node_modules/**",
            "**/.git/**",
            "**/.worktrees/**",
            "**/workspaces/**",
            "**/docs/archive/**",
          ],
        },
  },
  plugins: [
    tsConfigPaths({
      projects: ["./tsconfig.json"],
    }),
    tailwindcss(),
    tanstackStart({
      srcDirectory: "app",
    }),
    viteReact(),
    nitro({ serverDir: "server" }),
  ],
})
