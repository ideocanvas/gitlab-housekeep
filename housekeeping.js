require('dotenv').config();
const axios = require('axios');
const fs = require('fs');

const GITLAB_HOST = process.env.GITLAB_HOST;
const GITLAB_PRIVATE_TOKEN = process.env.GITLAB_PRIVATE_TOKEN;

if (!GITLAB_HOST || !GITLAB_PRIVATE_TOKEN) {
    console.error('Please set GITLAB_HOST and GITLAB_PRIVATE_TOKEN in your .env file.');
    process.exit(1);
}

const gitlab = axios.create({
    baseURL: `${GITLAB_HOST}/api/v4`,
    headers: {
        'Private-Token': GITLAB_PRIVATE_TOKEN,
    },
});

async function fetchAllProjects() {
    let allProjects = [];
    let page = 1;
    let response;
    do {
        response = await gitlab.get('/projects', {
            params: {
                per_page: 100,
                page: page,
                archived: false,
                simple: true,
                // statistics: true, // Request statistics for projects
            },
        });
        allProjects = allProjects.concat(response.data);
        page++;
    } while (response.headers['x-next-page']);
    return allProjects;
}
async function fetchAllJobs(projectId) {
    let allJobs = [];
    let page = 1;
    let response;
    do {
        response = await gitlab.get(`/projects/${projectId}/jobs`, {
            params: {
                per_page: 100,
                page: page,
            },
        });
        allJobs = allJobs.concat(response.data);
        page++;
    } while (response.headers['x-next-page']);
    return allJobs;
}

async function deleteProjectArtifacts(projectId, debug = false, dryRun = true) {
    console.log(`Starting deletion of old GitLab job artifacts for project ID: ${projectId}...`);
    if (dryRun) {
        console.log('DRY RUN mode: No artifacts will be deleted.');
    }
    if (debug) {
        console.log('DEBUG mode: Detailed logging enabled.');
    }

    try {
        let allJobs = [];
        let page = 1;
        let response;
        do {
            response = await gitlab.get(`/projects/${projectId}/jobs`, {
                params: {
                    per_page: 100,
                    page: page,
                },
            });
            allJobs = allJobs.concat(response.data);
            page++;
        } while (response.headers['x-next-page']);

        if (debug) console.log(`Found ${allJobs.length} jobs for project ID ${projectId}.`);

        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        for (const job of allJobs) {
            let expireAtDate;
            if (job.artifacts_expire_at) {
                expireAtDate = new Date(job.artifacts_expire_at);
            } else if (job.created_at) {
                // If artifacts_expire_at is not set, assume 7 days after creation
                expireAtDate = new Date(job.created_at);
                expireAtDate.setDate(expireAtDate.getDate() + 7);
                if (debug) console.log(`Job ${job.id} has no artifacts_expire_at. Assuming expiration 7 days after creation: ${expireAtDate.toISOString()}`);
            } else {
                if (debug) console.log(`Job ${job.id} has no artifacts_expire_at or created_at. Skipping.`);
                continue;
            }

            if (expireAtDate < sevenDaysAgo) {
                console.log(`Job ${job.id} in project ${projectId} has artifacts expiring at ${expireAtDate.toISOString()}, which is older than 7 days.`);
                if (!dryRun) {
                    console.log(`Attempting to delete artifacts for job ${job.id} in project ${projectId}...`);
                    try {
                        await gitlab.delete(`/projects/${projectId}/jobs/${job.id}/artifacts`);
                        console.log(`Successfully deleted artifacts for job ${job.id}.`);
                    } catch (error) {
                        console.error(`Error deleting artifacts for job ${job.id} in project ${projectId}:`, error.message);
                        if (error.response) {
                            console.error('Response data:', error.response.data);
                            console.error('Response status:', error.response.status);
                        }
                    }
                } else {
                    console.log(`DRY RUN: Would delete artifacts for job ${job.id} in project ${projectId}.`);
                }
            } else if (debug) {
                console.log(`Job ${job.id} artifacts expire at ${expireAtDate.toISOString()}, not older than 7 days.`);
            }
        }
        console.log(`Deletion of old GitLab job artifacts for project ID: ${projectId} completed.`);
        return true;
    } catch (error) {
        console.error(`An unhandled error occurred during artifact deletion for project ID ${projectId}:`, error.message);
        if (error.response) {
            console.error('Response data:', error.response.data);
            console.error('Response status:', error.response.status);
        }
        return false;
    }
}
async function deleteAllExpiredArtifacts(debug = false, dryRun = true) {
    console.log('Starting deletion of expired artifacts for ALL projects...');
    if (dryRun) {
        console.log('DRY RUN mode: No artifacts will be deleted.');
    }
    if (debug) {
        console.log('DEBUG mode: Detailed logging enabled.');
    }

    try {
        const allProjects = await fetchAllProjects();
        console.log(`Found ${allProjects.length} projects.`);

        for (const project of allProjects) {
            console.log(`Processing project: ${project.name} (ID: ${project.id}) for artifact deletion.`);
            await deleteProjectArtifacts(project.id, debug, dryRun);
        }
        console.log('Deletion of expired artifacts for ALL projects completed.');
        return true;
    } catch (error) {
        console.error('An unhandled error occurred during bulk artifact deletion:', error.message);
        if (error.response) {
            console.error('Response data:', error.response.data);
            console.error('Response status:', error.response.status);
        }
        return false;
    }
}


const OUTPUT_FILE = 'gitlab_artifact_summary.json';
const RAW_STATISTICS_FILE = 'gitlab_raw_project_statistics.json';

async function main(targetProjectId = null, forceUpdate = false) {
    console.log('Starting GitLab artifact housekeeping summary...');
    let projectArtifactSummaries = [];

    // Initialize or load existing summary data
    if (fs.existsSync(OUTPUT_FILE)) {
        try {
            projectArtifactSummaries = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
            console.log(`Loaded existing summary from ${OUTPUT_FILE}.`);
        } catch (parseError) {
            console.warn(`Could not parse existing ${OUTPUT_FILE}. Starting fresh.`, parseError.message);
            projectArtifactSummaries = [];
        }
    }

    try {
        let projectsWithStatistics = []; // This will hold all projects with their statistics, ready for summary generation

        if (targetProjectId) {
            console.log(`Fetching project with ID: ${targetProjectId}`);
            try {
                const response = await gitlab.get(`/projects/${targetProjectId}`, {
                    params: {
                        statistics: true, // Request statistics for a specific project
                    },
                });
                projectsWithStatistics.push(response.data); // This project already has statistics
                console.log(`Found project: ${response.data.name} (ID: ${response.data.id})`);
            } catch (error) {
                console.error(`Error fetching project ${targetProjectId}:`, error.message);
                if (error.response) {
                    console.error('Response data:', error.response.data);
                    console.error('Response status:', error.response.status);
                }
                process.exit(1); // Exit if a specific project cannot be fetched
            }
        } else {
            // Fetch all projects without statistics first
            const basicProjects = await fetchAllProjects();
            console.log(`Found ${basicProjects.length} projects.`);

            for (const project of basicProjects) {
                const existingEntry = projectArtifactSummaries.find(entry => entry.projectId === project.id);

                // Check if we can skip fetching statistics for this project
                if (!forceUpdate && existingEntry && !existingEntry.error && existingEntry.statistics) {
                    console.log(`Skipping project: ${project.name} (ID: ${project.id}) - data already exists and no error. Use --force-update to re-process.`);
                    projectsWithStatistics.push(existingEntry); // Use existing entry if valid and skipped
                    continue;
                }

                console.log(`Processing project: ${project.name} (ID: ${project.id})`);
                let projectWithStats = project;
                let projectError = null;

                try {
                    console.log(`Fetching statistics for project: ${project.name} (ID: ${project.id})`);
                    const response = await gitlab.get(`/projects/${project.id}`, {
                        params: {
                            statistics: true,
                        },
                    });
                    projectWithStats = response.data;
                } catch (error) {
                    projectError = `Error fetching statistics for project ${project.id}: ${error.message}`;
                    console.error(projectError);
                    if (error.response) {
                        console.error('Response data:', error.response.data);
                        console.error('Response status:', error.response.status);
                    }
                    projectWithStats.statistics = {}; // Ensure statistics object exists
                    projectWithStats.error = projectError; // Store error in the project object
                }
                projectsWithStatistics.push(projectWithStats); // Add the enriched project
            }
        }

        // Save raw project statistics to a separate file after all projects have been processed and enriched
        fs.writeFileSync(RAW_STATISTICS_FILE, JSON.stringify(projectsWithStatistics, null, 2), 'utf8');
        console.log(`Raw project statistics saved to ${RAW_STATISTICS_FILE}`);

        // Now, iterate over projectsWithStatistics to generate the summary
        for (const project of projectsWithStatistics) {
            console.log(`Generating summary for project: ${project.name} (ID: ${project.id})`);
            let buildArtifactsSizeBytes = 0;
            let projectError = project.error || null; // Carry over error from fetching statistics if any

            if (project.statistics && project.statistics.job_artifacts_size) {
                buildArtifactsSizeBytes = project.statistics.job_artifacts_size;
            } else {
                projectError = "Build artifacts size not available in project statistics.";
                console.warn(`Warning: Project ${project.name} (ID: ${project.id}) - ${projectError}`);
            }

            const summaryEntry = {
                projectId: project.id,
                projectName: project.name,
                buildArtifactsSizeBytes: buildArtifactsSizeBytes,
                buildArtifactsSizeMB: (buildArtifactsSizeBytes / (1024 * 1024)).toFixed(2),
                statistics: project.statistics, // Save the full statistics object
                error: projectError,
                timestamp: new Date().toISOString(),
            };

            // Check if project already exists in summary and update, otherwise add
            const existingIndex = projectArtifactSummaries.findIndex(entry => entry.projectId === project.id);
            if (existingIndex > -1) {
                projectArtifactSummaries[existingIndex] = summaryEntry;
            } else {
                projectArtifactSummaries.push(summaryEntry);
            }

            // Save after each project
            fs.writeFileSync(OUTPUT_FILE, JSON.stringify(projectArtifactSummaries, null, 2), 'utf8');
            console.log(`Summary for project ${project.name} saved to ${OUTPUT_FILE}`);
        }

        console.log('\n--- Final Artifact Size Summary ---');
        projectArtifactSummaries.forEach(entry => {
            console.log(`Project: ${entry.projectName} (ID: ${entry.projectId}) - Build Artifacts Size: ${entry.buildArtifactsSizeMB} MB ${entry.error ? `(Error: ${entry.error})` : ''}`);
        });

        console.log('\n--- Top 10 Projects by Artifact Size ---');
        const sortedProjects = [...projectArtifactSummaries].sort((a, b) => b.buildArtifactsSizeBytes - a.buildArtifactsSizeBytes);
        sortedProjects.slice(0, 10).forEach((entry, index) => {
            console.log(`${index + 1}. Project: ${entry.projectName} (ID: ${entry.projectId}) - Build Artifacts Size: ${entry.buildArtifactsSizeMB} MB`);
        });

    } catch (error) {
        console.error('An unhandled error occurred during main execution:', error.message);
        if (error.response) {
            console.error('Response data:', error.response.data);
            console.error('Response status:', error.response.status);
        }
    }
}

// Allow running with a specific project ID from command line arguments
const args = process.argv.slice(2);
const projectIdArg = args.find(arg => arg.startsWith('--project-id='));
const targetProjectId = projectIdArg ? parseInt(projectIdArg.split('=')[1], 10) : null;
const forceUpdate = args.includes('--force-update');
const dryRun = args.includes('--dry-run');
const deleteProjectIdArg = args.find(arg => arg.startsWith('--delete-project-id='));
const deleteProjectId = deleteProjectIdArg ? deleteProjectIdArg.split('=')[1] : null;

// If a delete project ID is provided, execute deletion and exit
if (deleteProjectId === 'all') {
    console.log('Initiating artifact deletion for all projects...');
    deleteAllExpiredArtifacts(true, dryRun).then(success => {
        if (success) {
            console.log('Artifact deletion process for all projects completed.');
        } else {
            console.error('Artifact deletion process for all projects failed.');
        }
        process.exit(0);
    }).catch(error => {
        console.error('An error occurred during bulk artifact deletion:', error.message);
        process.exit(1);
    });
} else if (deleteProjectId) {
    const parsedProjectId = parseInt(deleteProjectId, 10);
    if (isNaN(parsedProjectId)) {
        console.error(`Invalid project ID provided: ${deleteProjectId}. Please provide a number or 'all'.`);
        process.exit(1);
    }
    console.log(`Initiating artifact deletion for project ID: ${parsedProjectId}`);
    deleteProjectArtifacts(parsedProjectId, true, dryRun).then(success => {
        if (success) {
            console.log(`Artifact deletion process for project ID ${parsedProjectId} completed.`);
        } else {
            console.error(`Artifact deletion process for project ID ${parsedProjectId} failed.`);
        }
        process.exit(0);
    }).catch(error => {
        console.error(`An error occurred during artifact deletion for project ID ${parsedProjectId}:`, error.message);
        process.exit(1);
    });
} else {
    main(targetProjectId, forceUpdate);
}