pipeline {
    agent any

    triggers {
        cron('H H/3 * * *')
    }

    environment {
        HEADLESS = 'true'
        MEDIA_DIR = 'C:/Users/BrunoCamargo/OneDrive - Favitec/Evidências/Midias para automação'
    }

    options {
        timeout(time: 30, unit: 'MINUTES')
        buildDiscarder(logRotator(numToKeepStr: '20'))
    }

    stages {
        stage('Install') {
            steps {
                bat 'npm ci'
                bat 'npx playwright install chromium --with-deps'
            }
        }

        stage('Run Tests') {
            steps {
                withCredentials([file(credentialsId: 'synthetic-tests-env', variable: 'ENV_FILE')]) {
                    bat "copy %ENV_FILE% .env"
                    bat 'node runner.js'
                }
            }
        }
    }

    post {
        always {
            bat 'if exist .env del .env'
            deleteDir()
        }
    }
}
