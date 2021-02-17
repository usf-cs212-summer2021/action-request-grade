const core = require('@actions/core');
const github = require('@actions/github');

var { DateTime } = require('luxon');

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

function calculateGrade(created, project, type) {
  core.startGroup(`Calculating grade...`);

  // all github timestamps are in ISO 8601 format

  const createdDate = DateTime.fromISO(created);
  core.info(`Release created: ${createdDate.toDateString()}`);

  const deadline = DateTime.fromISO(
    constants[type.toLowerCase()][project],
    {zone: 'America/Los_Angeles'}
  );
  core.info(`${type} deadline: ${deadline.toDateString()}`);

  if (createdDate < deadline) {
    core.info(`Release created before deadline!`);
    return 100;
  }
  else {
    const days = createdDate.diff(deadline, 'days');
    core.info(`Release is ${days} days late.`);
  }

  core.endGroup();
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

// async function createIssue(octokit, project, type, title, body) {
//
//   const labels = [`project${project}`, type];
//   const assignee = constants.assign[type];
//
//   const milestone = await getMilestone(octokit, project);
//
//   core.info(`\nCreating ${type} issue...`);
//   const issue = octokit.issues.create({
//     owner: github.context.repo.owner,
//     repo: github.context.repo.repo,
//     assignee: assignee,
//     labels: labels,
//     milestone: milestone.number,
//     title: title,
//     body: body
//   });
//
//   if (issue.status == 201) {
//     core.info(`Created issue #${issue.number}.`);
//     return issue;
//   }
//
//   core.info(`Result: ${JSON.stringify(issue)}`);
//   throw new Error(`Unable to create "${title}" issue.`);
// }

async function run() {
  try {
    const token = core.getInput('token');
    core.setSecret(token);

    const octokit = github.getOctokit(token);

    const states = {}; // values saved from setup
    utils.restoreStates(states);

    const project = getProject(states.release);
    const type = states.type;
    const lower = type.toLowerCase(); // used as constants key and issue label
    const title = `Project ${states.release} ${type} Grade`;

    core.info(`Requesting ${title}...\n`);

    if (type == 'Functionality') {


      // const funIssues = findIssues(octokit, project, states.type);
      //
      // if (funIssues.length > 0) {
      //   core.warning(`Found ${funIssues.length} related ${states.type} issues for project ${3}. Are you sure you need to make a new request?`);
      // }

      calculateGrade(states.releaseDate, project, type);

      // -----------------------------------------------
      core.startGroup(`Creating functionality issue...`);

      // check if issue of same title already exists
      // check if prior issues of same type but different releases

//       const body = `
// ## Student Information
//
//   - **Full Name:** [FULL_NAME]
//   - **USF Email:** [USERNAME]
//
// ## Project Information
//
//   - **Project:** Project ${project} ${constants.names[project]}
//   - **${upperType} Deadline:** ${constants[states.type][project].toDateString()}
//   - **Release:** [${states.release}](${states.releaseUrl})
//   - **Release Date:** Pending
//
// ## Grade Information
//
// Pending
//       `;

      // createIssue(octokit, project, type.toLowerCase(), title, body);

      core.endGroup();
    }
    else if (states.type == 'Design') {
      core.info('Hello world.');
    }
    else {
      throw new Error(`The value "${type}" is not a valid project grade type.`);
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
