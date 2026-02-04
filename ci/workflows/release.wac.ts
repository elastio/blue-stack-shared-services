import { workflow } from "@elastio/ci";
import { isDeployableBranch, defaultWorkflowEnv } from "./lib/constants";
import { configurePromotionJob, imagePromote } from "./lib/image.jobs";
import { releaseDeployToK8S } from "./lib/deploy.jobs";

export const workflowFile = workflow.file({
  on: {
    workflow_dispatch: {},
  },
  jobs: {
    "configure-promotion": configurePromotionJob(),
    "promote-image": {
      ...imagePromote(),
      needs: ["configure-promotion"],
    },
    "deploy-to-k8s": {
      ...releaseDeployToK8S(),
      needs: ["promote-image"],
    },
  },
  concurrency: {
    group: `\${{ ( ${isDeployableBranch} ) && 'release' || github.ref }}`,
    "cancel-in-progress": `\${{ ! ( ${isDeployableBranch} ) }}`,
  },
  env: defaultWorkflowEnv,
});
