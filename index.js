const core = require('@actions/core');
const github = require('@actions/github');

function checkDesign() {

}

function createFunctionalityIssue() {

}

function createDesignIssue() {

}

async function run() {
  try {
    const token = core.getInput('token');
    core.setSecret(token);

    const octokit = github.getOctokit(token);

    core.info('Hello world');

    // if (design !== true) {
    //   // -----------------------------------------------
    //   core.startGroup(`Requesting functionality grade...`);
    //   createFunctionalityIssue();
    //   core.endGroup();
    // }
    // else {
    //   // -----------------------------------------------
    //   core.startGroup(`Requesting design grade...`);
    //   checkDesign()
    //   createDesignIssue();
    //   core.endGroup();
    // }
  }
  catch (error) {
    // show error in group
    utils.showError(`${error.message}`);
    core.endGroup();

    // displays outside of group; always visible
    core.setFailed(`Unable to request project grade. ${error.message}`);
  }
}

run();
