// =====================================================================
// PickleBook CI/CD pipeline (pipeline as code)
//
//   git push -> Jenkins notices the new commit -> Checkout -> Test
//            -> Build Images (tagged with the build number) -> Deploy
//            -> Smoke Test (auto-rollback if the new version is unhealthy)
//
// Secrets: the real .env file is stored in Jenkins as a "Secret file"
// credential (ID: picklebook-env). It is copied in only for deployment
// and deleted at the end of every run.
// =====================================================================
pipeline {
    agent any

    environment {
        COMPOSE_PROJECT_NAME = 'picklebook'   // same project name every run = same containers + same DB volume
        TAG = "${env.BUILD_NUMBER}"            // every image gets the build number as its version tag
    }

    triggers {
        // Poll SCM: check the Git repository every minute; build only if there is a new commit.
        pollSCM('* * * * *')
        // Using a GitHub webhook through ngrok instead? Also enable this for instant builds:
        // githubPush()
    }

    options {
        skipDefaultCheckout(true)                       // we check out in our own Checkout stage
        disableConcurrentBuilds()                       // never deploy two versions at the same time
        buildDiscarder(logRotator(numToKeepStr: '20'))  // keep the last 20 build logs
        timeout(time: 30, unit: 'MINUTES')
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
                sh 'git log -1 --pretty=format:"Commit %h by %an: %s"'
            }
        }

        stage('Test') {
            // QUALITY GATE: each command builds the "test" stage of the module's
            // Dockerfile, which runs "npm test". One failing test = non-zero exit
            // = the pipeline stops here and Deploy never runs.
            steps {
                sh 'docker build --target test -t picklebook/courts-api:test ./courts-api'
                sh 'docker build --target test -t picklebook/reservations-api:test ./reservations-api'
            }
        }

        stage('Build Images') {
            // Builds every image as picklebook/<service>:<build number>.
            // Building needs no secrets, so the placeholder .env.example is enough here.
            steps {
                sh 'docker compose --env-file .env.example build'
                sh 'docker images --filter "reference=picklebook/*:${TAG}"'
            }
        }

        stage('Deploy') {
            steps {
                withCredentials([file(credentialsId: 'picklebook-env', variable: 'ENV_FILE')]) {
                    sh 'cp "$ENV_FILE" .env'
                }
                // Replaces only containers whose image changed. The pg-data volume is
                // never removed (no "-v"), so the database keeps its data.
                sh 'docker compose up -d --no-build --remove-orphans'
            }
        }

        stage('Smoke Test') {
            steps {
                script {
                    def passed = sh(script: 'sh scripts/smoke-test.sh', returnStatus: true) == 0
                    if (!passed) {
                        // The new version is unhealthy: automatically go back to the last good build.
                        def lastGood = currentBuild.previousSuccessfulBuild?.number
                        if (lastGood) {
                            echo "Smoke test failed. Rolling back to build ${lastGood}..."
                            sh "TAG=${lastGood} docker compose up -d --no-build --remove-orphans"
                        }
                        error("Smoke test failed for build ${env.TAG}")
                    }
                }
            }
        }
    }

    post {
        success {
            echo "SUCCESS: PickleBook build ${env.TAG} is live at http://localhost:8080"
            sh 'docker compose ps --format "table {{.Service}}\t{{.Image}}\t{{.Status}}" > deploy-report.txt'
            archiveArtifacts artifacts: 'deploy-report.txt', allowEmptyArchive: true
        }
        failure {
            echo "FAILED: build ${env.TAG} was NOT deployed (or was rolled back). Check the red stage's log."
            echo "Manual rollback: run the 'picklebook-rollback' job with the build number you want."
        }
        cleanup {
            sh 'rm -f .env'                        // never leave the real secrets in the workspace
            sh 'docker image prune -f || true'     // remove dangling image layers to save disk space
        }
    }
}
