import { deindent } from "@gustavnikolaj/string-utils";
import { version as ci_version } from "@elastio/ci/package.json";
import { job, Jobs, step } from "@elastio/ci";
import { ciImage, defaultRunner } from "./constants";
import { cache } from "./helper.steps";

export const jobs: Jobs = job.prefixed("🅲 ", {
  typos: {
    "runs-on": "ubuntu-latest",
    steps: [
      step.checkout(),
      { uses: "crate-ci/typos@v1.39.0" },
    ],
  },

  "ci-checks": {
    uses: `elastio/ci-lib/.github/workflows/ci-checks.yml@v${ci_version}`,
  },

  "check-golang-fmt": {
    "runs-on": defaultRunner,
    container: {
      image: ciImage,
      options: "--user elastio",
    },
    steps: [
      step.checkout(),
      {
        run: "gofmt -w .",
      },
      {
        run: deindent`
          git diff --exit-code --color=always \
            || (echo -e "\n\nRun gofmt and commit the changes" && exit 1)
        `,
      },
    ],
  },

  "check-golang-lint": {
    "runs-on": defaultRunner,
    container: {
      image: ciImage,
      options: "--user elastio",
    },
    steps: [
      step.checkout(),
      {
        uses: "golangci/golangci-lint-action@v8",
      },
    ],
  },

  "check-build": {
    "runs-on": defaultRunner,
    container: {
      image: ciImage,
      options: "--user elastio",
    },
    steps: [
      step.checkout(),
      cache(
        "${{ runner.os }}-go-build-${{ hashFiles('go.mod') }}",
        "/go/pkg/mod",
      ),
      {
        name: "Build",
        run: deindent`
          go mod download
          go build ./...
        `,
      },
    ],
  },
});
