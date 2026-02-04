export const defaultRunner = "bluestack";

export const ciImage = "elastio/golang_ci:sha-2dee071";
export const infraShellImage = "elastio/infra_shell:sha-ca88e5d";

export const isMasterBranch = "github.ref == 'refs/heads/master'";
export const isProdBranch = "github.ref == 'refs/heads/production'";
export const isStagingBranch = "github.ref == 'refs/heads/staging'";
export const isDeployableBranch = `${isMasterBranch} || ${isStagingBranch} || ${isProdBranch}`;

export const cells_config_file = "ci/deployment/bs-cells.json";

export const aws_bs_resources = {
  ro_role_arn: "arn:aws:iam::648105227319:role/GitHub-OIDC-SharedServices-ECR-RO",
  rw_role_arn: "arn:aws:iam::648105227319:role/GitHub-OIDC-SharedServices-ECR-RW",
  region: "us-east-2",
};

export const aws_bs_staging = {
  rw_role_arn: "arn:aws:iam::937593779230:role/Github-Actions-OIDC-Role",
  region: "eu-central-1",
};

export const aws_bs_production = {
  rw_role_arn: "arn:aws:iam::383849438603:role/Github-Actions-OIDC-Role",
  region: "us-east-2",
};

export const defaultWorkflowEnv = {
  CI_BS_RESOURCES_AWS_DEFAULT_REGION: aws_bs_resources.region,
  CI_BLUE_STACK_STAGING_AWS_DEFAULT_REGION: aws_bs_staging.region,
  CI_BLUE_STACK_PRODUCTION_AWS_DEFAULT_REGION: aws_bs_production.region,
};
