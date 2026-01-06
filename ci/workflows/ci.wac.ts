import { workflow } from "@elastio/ci";

import * as checks from "./lib/checks.jobs";

export const workflowFile = workflow.file({
  name: "ci",
  on: {
    pull_request: {
      branches: ["master"],
    },
    push: {
      branches: ["master"],
    },
    workflow_dispatch: {},
  },
  jobs: {
    ...checks.jobs,
  },
  concurrency: {
    group: "${{ github.ref }}",
    "cancel-in-progress": "${{ github.ref != 'refs/heads/master' }}",
  },
});
