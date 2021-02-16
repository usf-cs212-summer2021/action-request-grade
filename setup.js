const core = require('@actions/core');
const github = require('@actions/github');

async function run() {
  try {
    const token = 
  }
  catch (error) {
    utils.showError(`${error.message}\n`); // show error in group
    core.endGroup();  // end group

    // displays outside of group; always visible
    core.setFailed(`Invalid project grade request. ${error.message}`);
  }
}

run();
