const core = require('@actions/core');
const github = require('@actions/github');
const constants = require('./constants.js');
const utils = require('./utils.js');

function getProject(release) {
  const regex = /^v([1-4])\.(\d+)\.(\d+)$/;
  const matched = release.match(regex);

  if (matched !== null && matched.length === 4) {
    return parseInt(matched[1]);
  }

  throw new Error(`Unable to parse project from release ${release}.`);
}

async function findIssues(octokit, project, type) {
  core.info(`Looking up ${type} issues for project ${project}...`);
  const result = await octokit.issues.listForRepo({
    owner: github.context.repo.owner,
    repo: github.context.repo.repo,
    labels: `project${project},${type}`
  });

  if (result.status == 200) {
    return result.data;
  }

  core.info(`No issues found.`);
  return [];
}

async function getMilestone(octokit, project) {
  const title = `Project ${project}`;

  core.info('\nListing milestones...');
  const milestones = await octokit.issues.listMilestones({
    owner: github.context.repo.owner,
    repo: github.context.repo.repo
  });

  if (milestones.status == 200) {
    const found = milestones.data.find(x => x.title === title);

    if (found === undefined) {
      const create = await octokit.issues.createMilestone({
        owner: github.context.repo.owner,
        repo: github.context.repo.repo,
        title: title,
        state: 'open',
        description: `Project ${project} ${constants.names[project]}`
      });

      if (create.status == 201) {
        core.info(`Created ${create.data.title} milestone.`);
        return create.data;
      }

      core.info(`Result: ${JSON.stringify(create)}`);
      throw new Error(`Unable to create ${title} milestone.`);
    }
    else {
      core.info(`Found ${found.title} milestone.`);
      return found;
    }
  }

  core.info(`Result: ${JSON.stringify(milestones)}`);
  throw new Error('Unable to list milestones.');
}

async function createIssue(octokit, project, type, title, body) {

  const labels = [`project${project}`, type];
  const assignee = constants.assign[type];

  const milestone = await getMilestone(octokit, project);

  core.info(`\nCreating ${type} issue...`);
  const issue = octokit.issues.create({
    owner: github.context.repo.owner,
    repo: github.context.repo.repo,
    assignee: assignee,
    labels: labels,
    milestone: milestone.number,
    title: title,
    body: body
  });

  if (issue.status == 201) {
    core.info(`Created issue #${issue.number}.`);
    return issue;
  }

  core.info(`Result: ${JSON.stringify(issue)}`);
  throw new Error(`Unable to create "${title}" issue.`);
}

async function run() {
  try {
    const token = core.getInput('token');
    core.setSecret(token);

    const octokit = github.getOctokit(token);

    const states = {}; // values saved from setup
    utils.restoreStates(states);

    const project = getProject(states.release);
    const upperType = `${states.type.charAt(0).toUpperCase()}${states.type.slice(1)}`;
    const title = `Project ${states.release} ${upperType} Grade`;

    core.info(`Requesting ${title}...\n`);

    if (states.type == 'functionality') {


      // const funIssues = findIssues(octokit, project, states.type);
      //
      // if (funIssues.length > 0) {
      //   core.warning(`Found ${funIssues.length} related ${states.type} issues for project ${3}. Are you sure you need to make a new request?`);
      // }

      // -----------------------------------------------
      core.startGroup(`Creating functionality issue...`);

      // check if issue of same title already exists
      // check if prior issues of same type but different releases

      const body = `
## Student Information

  - **Full Name:** [FULL_NAME]
  - **USF Email:** [USERNAME]

## Project Information

  - **Project:** Project ${project} ${constants.names[project]}
  - **${upperType} Deadline:** ${constants[states.type][project].toDateString()}
  - **Release:** [${states.release}](${states.releaseUrl})
  - **Release Date:** Pending

## Grade Information

Pending
      `;

      createIssue(octokit, project, type, title, body);

      core.endGroup();
    }
    else if (states.type == 'design') {
      core.info('Hello world.');
    }
    else {
      throw new Error(`The value "${states.type}" is not a valid project grade type.`);
    }
  }
  catch (error) {
    // show error in group
    utils.showError(`${error.message}\n`);
    core.endGroup();

    // displays outside of group; always visible
    core.setFailed(`Unable to request project grade. ${error.message}`);
  }
}

run();
