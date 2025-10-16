# GitLab Housekeeping Script

This project contains a JavaScript script (`housekeeping.js`) designed to assist with housekeeping tasks related to GitLab artifacts. It likely automates certain maintenance or cleanup operations within a GitLab environment.

## Project Structure

- [`housekeeping.js`](housekeeping.js): The main script responsible for performing GitLab housekeeping tasks.
- [`package.json`](package.json): Defines project metadata and dependencies.
- [`yarn.lock`](yarn.lock): Yarn lock file for dependency management.
- [`.env.example`](.env.example): Example file for environment variables, likely containing sensitive information like API tokens or configuration settings.
- [`.gitignore`](.gitignore): Specifies intentionally untracked files to ignore.

## Setup

To set up this project, follow these steps:

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/ideocanvas/gitlab-housekeep.git
    cd gitlab-housekeep
    ```

2.  **Install dependencies:**
    This project uses Yarn for dependency management.
    ```bash
    yarn install
    ```
    Alternatively, if you prefer npm:
    ```bash
    npm install
    ```

3.  **Configure environment variables:**
    Copy the example environment file and fill in your specific GitLab configuration details.
    ```bash
    cp .env.example .env
    ```
    Edit the newly created `.env` file with your GitLab API token, project IDs, or any other necessary settings.

## Usage

To run the housekeeping script, execute the `housekeeping.js` file using Node.js. The script supports several command-line arguments for different use cases:

### General Usage

```bash
node housekeeping.js
```
This will generate a summary of GitLab artifact sizes for all projects and save it to `gitlab_artifact_summary.json`. It will also save raw project statistics to `gitlab_raw_project_statistics.json`.

### Specific Project Summary

To generate a summary for a specific project, use the `--project-id` argument:

```bash
node housekeeping.js --project-id=<YOUR_PROJECT_ID>
```
Replace `<YOUR_PROJECT_ID>` with the actual ID of the GitLab project.

### Force Update Project Statistics

To force the script to re-fetch and update project statistics, even if existing data is present, use the `--force-update` argument:

```bash
node housekeeping.js --force-update
```
This can be combined with `--project-id` to force an update for a single project.

### Delete Expired Artifacts for a Specific Project (Dry Run)

To see which artifacts would be deleted for a specific project without actually deleting them, use `--delete-project-id` along with `--dry-run`:

```bash
node housekeeping.js --delete-project-id=<YOUR_PROJECT_ID> --dry-run
```
Replace `<YOUR_PROJECT_ID>` with the actual ID of the GitLab project.

### Delete Expired Artifacts for a Specific Project (Live Run)

To actually delete expired artifacts for a specific project:

```bash
node housekeeping.js --delete-project-id=<YOUR_PROJECT_ID>
```
**Use with caution!** This will permanently delete artifacts older than 7 days (or 7 days after creation if no explicit expiration is set).

### Delete Expired Artifacts for ALL Projects (Dry Run)

To see which artifacts would be deleted across all projects without actually deleting them:

```bash
node housekeeping.js --delete-project-id=all --dry-run
```

### Delete Expired Artifacts for ALL Projects (Live Run)

To actually delete expired artifacts for all projects:

```bash
node housekeeping.js --delete-project-id=all
```
**Use with extreme caution!** This will permanently delete artifacts older than 7 days (or 7 days after creation if no explicit expiration is set) for all projects accessible by your GitLab token.

Please refer to the comments and logic within [`housekeeping.js`](housekeeping.js) for detailed information on its functionality and configurable options.

## Contributing

Contributions are welcome! Please feel free to open issues or submit pull requests.

## License

This project is licensed under the [Apache License 2.0](LICENSE).