export const defaultRunner = "bluestack";

export const ciImage = "elastio/golang_ci:sha-2dee071";

export const isMasterBranch = "github.ref == 'refs/heads/master'";
export const isProdBranch = "github.ref == 'refs/heads/production'";
export const isStagingBranch = "github.ref == 'refs/heads/staging'";
export const isDeployableBranch = `${isMasterBranch} || ${isStagingBranch} || ${isProdBranch}`;
