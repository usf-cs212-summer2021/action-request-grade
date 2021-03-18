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
  core.startGroup(`Calculating project ${project} ${type.toLowerCase()} grade...`);

  const results = {};
  const zone = 'America/Los_Angeles';
  core.info(`\nRelease created: ${created}`);

  // all github timestamps are in ISO 8601 format
  const createdDate = DateTime.fromISO(created).setZone(zone);
  results.created = createdDate.toLocaleString(DateTime.DATETIME_FULL);
  core.info(`Parsed created date: ${results.created}`);

  const deadlineText = `${constants[type.toLowerCase()][project]}T23:59:59`
  const deadline = DateTime.fromISO(deadlineText, {zone: zone});
  results.deadline = deadline.toLocaleString(DateTime.DATETIME_FULL);
  core.info(`Parsed ${type.toLowerCase()} deadline: ${results.deadline}`);

  if (createdDate < deadline) {
    core.info(`Release created before deadline!`);
    results.late = 0;
  }
  else {
    const days = createdDate.diff(deadline, 'days').toObject().days;
    core.info(`Release created ${days} day(s) late.`);

    results.late = 1 + Math.floor(days / 7.0);
    core.info(`Release is within ${results.late} week(s) late.`);
  }

  results.grade = 100 - (results.late * 10);
  core.info(`Project ${project} ${type.toLowerCase()} earned a ${results.grade}% grade (before deductions).`);

  core.info(JSON.stringify(results));
  core.info('');
  core.endGroup();

  return results;
}

async function findIssues(octokit, project, type) {
  core.info(`Looking up ${type.toLowerCase()} issues for project ${project}...`);

  const labels = [`project${project}`];

  if (type) {
    labels.push(type.toLowerCase);
  }

  const result = await octokit.issues.listForRepo({
    owner: github.context.repo.owner,
    repo: github.context.repo.repo,
    labels: labels.join(','),
    state: 'all'
  });

  if (result.status == 200) {
    core.info(`Found ${result.data.length} issues for project ${project} ${type.toLowerCase()}.`);
    return result.data;
  }

  throw new Error(`Unable to list issues for ${github.context.repo.repo}.`);
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
  const labels = [`project${project}`, type.toLowerCase()];
  const assignee = constants.assign[type.toLowerCase()];

  const milestone = await getMilestone(octokit, project);

  core.info(`\nCreating ${type.toLowerCase()} issue...`);
  const issue = await octokit.issues.create({
    owner: github.context.repo.owner,
    repo: github.context.repo.repo,
    assignee: assignee,
    labels: labels,
    milestone: milestone.number,
    title: title,
    body: body
  });

  if (issue.status == 201) {
    core.info(`Created issue #${issue.data.number}.`);
    return issue;
  }

  core.info(`Result: ${JSON.stringify(issue)}`);
  throw new Error(`Unable to create "${title}" issue.`);
}

async function updateIssue(octokit, issue, comment) {
  core.info(`\nAdding instructions to issue #${issue.data.number}...`);
  const result = await octokit.issues.createComment({
    owner: github.context.repo.owner,
    repo: github.context.repo.repo,
    issue_number: issue.data.number,
    body: comment
  });

  if (result.status != 201) {
    core.info(`Result: ${JSON.stringify(result)}`);
    throw new Error(`Unable to comment on issue #${issue.data.number}.`);
  }

  core.info(`Comment created at: ${result.data.html_url}`);

  core.info(`\nClosing issue #${issue.data.number}...`);
  const closed = await octokit.issues.update({
    owner: github.context.repo.owner,
    repo: github.context.repo.repo,
    issue_number: issue.data.number,
    state: 'closed'
  });

  if (closed.status != 200) {
    core.info(`Result: ${JSON.stringify(closed)}`);
    throw new Error(`Unable to close issue #${issue.data.number}.`);
  }
}

async function run() {
  try {
    const token = core.getInput('token');
    core.setSecret(token);

    const octokit = github.getOctokit(token);

    const states = {}; // values saved from setup
    utils.restoreStates(states);

    const project = getProject(states.release);
    const type = states.type;
    const title = `Project ${states.release} ${type} Grade`;

    const comment = `
## Student Instructions

Hello @${github.context.actor}! Please follow these instructions to request your project ${project} ${type.toLowerCase()} grade:

- [ ] Replace \`[FULL_NAME]\` with your full name and \`[USF_EMAIL]\` with your USF username so we can enter your grade on Canvas.

- [ ] Double-check the [labels, assignee, and milestone](https://guides.github.com/features/issues/) are set properly.

- [ ] Double check the parsed dates and resulting grade. It is possible the difference in time zones affected the math. If there is an error, please add a comment notifying us of the issue.

- [ ] **Re-open the issue when all of the above is complete.**

Click each of the above tasks as you complete them!

We will reply and lock this issue once the grade is updated on Canvas. If we do not respond within 2 *business* days, please reach out on CampusWire.

:warning: **We will not see this issue and update your grade until you re-open it!**
    `;

    if (type == 'Functionality') {
      // -----------------------------------------------
      core.startGroup(`Checking for previous ${type.toLowerCase()} issues...`);
      core.info(`\nRequesting ${title}...`);

      const issues = await findIssues(octokit, project, type);
      const same = issues.find(x => x.title == title);

      if (same != undefined) {
        core.info(`Result: ${JSON.stringify(same)}`);
        throw new Error(`An issue titled "${title}" already exists. Fix or delete that issue to proceed.`);
      }

      if (issues.length > 0) {
        core.info(`Result: ${JSON.stringify(issues)}`);
        throw new Error(`Found ${issues.length} ${type.toLowerCase()} issue(s) for project ${project} already. Only one such issue should be required. Are you sure you need to create a new issue? Consider fixing or deleting the other issues instead!`);
      }
      else {
        core.info(`This appears to be the first project ${project} ${type.toLowerCase()} issue.`);
      }

      // TODO Check for verification of previous projects.
      core.info('');
      core.endGroup();

      // -----------------------------------------------
      const grade = calculateGrade(states.releaseDate, project, type);

      // -----------------------------------------------
      core.startGroup(`Creating functionality issue...`);

      const body = `
## Student Information

  - **Full Name:** [FULL_NAME]
  - **USF Email:** [USF_EMAIL]@usfca.edu

## Project Information

  - **Project:** Project ${project} ${constants.names[project]}
  - **${type} Deadline:** ${grade.deadline}

## Release Information

  - **Release:** [${states.release}](${states.releaseUrl})
  - **Release Verified:** [Run ${states.runNumber} (${states.runId})](${states.runUrl})
  - **Release Created:** ${grade.created}

## Grade Information

  - **Late Penalty:** \`${grade.late * 10}\`
  - **Project ${type} Grade:** \`${grade.grade}%\` (before deductions)

      `;

      const issue = await createIssue(octokit, project, type.toLowerCase(), title, body);

      await updateIssue(octokit, issue, comment);

      core.info('');
      core.endGroup();

      utils.showSuccess(`${type} issue #${issue.data.number} for project ${project} release ${states.release} created. Visit the issue for further instructions at: ${issue.data.html_url}`);
      utils.showWarning(`Grade not yet updated! Visit the created issue for further instructions!`);

    }
    else if (type == 'Design') {
      // -----------------------------------------------
      core.startGroup(`Checking for previous project ${project} issues...`);
      core.info(`\nRequesting ${title}...`);

      const issues = await findIssues(octokit, project, undefined);
      const same = issues.find(x => x.title == title);

      if (same != undefined) {
        core.info(`Result: ${JSON.stringify(same)}`);
        throw new Error(`An issue titled "${title}" already exists. Fix or delete that issue to proceed.`);
      }

      if (issues.length > 1) {
        core.info(`Result: ${JSON.stringify(issues)}`);
        throw new Error(`Found ${issues.length} issue(s) for project ${project} already. Are you sure you need to create a new issue? Consider fixing or deleting the other issues instead!`);
      }

      // TODO Check for closed functionality issue

      core.info('');
      core.endGroup();

      core.startGroup('Handling project design grade request...');


      /*
      Must already have functionality grade.
      Must have a passing release.
      List all approved pull requests.
      List all extra pull requests with a warning.
      Number, vLabel, Type Approved Date
      Use first approved pull to calculate design grade.

      */



      throw new Error(`This action does not yet support design grades. Contact the instructor for details on how to proceed.`);
    }
    else {
      core.startGroup('Handling unknown request...');
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
