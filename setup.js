const core = require('@actions/core');
const github = require('@actions/github');

const usage = 'Grade types must start with "f" for functionality (test) grades or "d" for design (code review) grades.';

function checkRequestType() {
  const type = core.getInput('type');
  core.info(`Checking request type: ${type}`);

  if (!type) {
    throw new Error(`Missing required project grade type. ${usage}`);
  }

  switch (type.charAt(0)) {
    case 'd': case 'D':
      core.info('Requesting project design grade.');
      return true;
    case 'f': case 'F':
      core.info('Requesting project functionality grade.');
      return false;
    default:
      throw new Error(`The value "${type}" is not a valid project grade type. ${usage}`);
  }
}

function checkRelease(octokit) {
  const release = core.getInput('release');

  const owner = github.context.repo.owner;
  const repo = github.context.repo.repo;

  core.info(`\nGetting release ${release} from ${repo}...`);
  const result = await octokit.repos.getReleaseByTag({
    owner: owner, repo: repo, tag: release
  });

  core.info(JSON.stringify(result));

  return release;
}

function checkFunctionality() {

}

async function run() {
  try {
    const token = core.getInput('token');
    core.setSecret(token);

    const octokit = github.getOctokit(token);

    // -----------------------------------------------
    core.startGroup('Verifying request input...');

    const design = checkRequestType();
    const release = checkRelease(octokit);

    core.saveState('design', design);
    core.saveState('release', release);

    core.endGroup();

    // -----------------------------------------------
    core.startGroup(`Verifying release ${release}...`);
    checkFunctionality();
    core.endGroup();
  }
  catch (error) {
    // show error in group
    utils.showError(`${error.message}`);
    core.endGroup();

    // displays outside of group; always visible
    core.setFailed(`Invalid project grade request. ${error.message}`);
  }
}

run();
