import { Step } from "@elastio/ci";

export function cache(key: string, path: string, restoreKeys?: string): Step {
  return {
    uses: "actions/cache@v4",
    with: {
      key,
      path,
      "restore-keys": restoreKeys,
    },
  };
}
