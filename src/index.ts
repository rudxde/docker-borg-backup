import { run } from './run';
import { promises } from 'fs';
import yargs from 'yargs';
import * as cron from 'node-cron';

interface IOptions {
    sshPort: number;
    sshHost: string;
    backupDir: string;
    borgRepository: string;
    backupIntervalCron: string;
    cleanupIntervalCron: string;
    cleanupKeep: string;
    sshKeyFile: string;
    borgPassphrase?: string;
    borgPassphraseFile?: string;
}

interface IBorgEnv {
    BORG_PASSPHRASE: string;
    BORG_RSH: string;
}

async function main() {
    const options: IOptions = yargs
        .env()
        .option('sshPort', {
            type: 'number',
            demandOption: true,
        })
        .option('sshHost', {
            type: 'string',
            demandOption: true,
        })
        .option('backupDir', {
            type: 'string',
            demandOption: true,
        })
        .option('borgRepository', {
            type: 'string',
            demandOption: true,
        })
        .option('backupIntervalCron', {
            type: 'string',
            demandOption: true,
        })
        .option('cleanupIntervalCron', {
            type: 'string',
            demandOption: true,
        })
        .option('cleanupKeep', {
            type: 'string',
            demandOption: true,
        })
        .option('sshKeyFile', {
            type: 'string',
            demandOption: true,
        })
        .option('borgPassphrase', {
            type: 'string',
        })
        .option('borgPassphraseFile', {
            type: 'string',
        })
        .check((args: IOptions) => {
            if (args.borgPassphrase || args.borgPassphraseFile) {
                return true
            }
            return 'borgPassphrase and borgPassphraseFile are not set!'
        })
        .option('sshKeyFile', {
            type: 'string',
            demandOption: true,
        })
        .argv;
    let borg_passphrase = options.borgPassphrase;
    if (!borg_passphrase) {
        borg_passphrase = (await promises.readFile(options.borgPassphraseFile!)).toString();
    }
    const borgEnv: IBorgEnv = {
        BORG_PASSPHRASE: borg_passphrase,
        BORG_RSH: `ssh -i ${options.sshKeyFile} -o StrictHostKeyChecking=no`
    };
    if (!await repoExists(options, borgEnv)) {
        await initBorgRepo(options, borgEnv);
    }
    cron.schedule(options.backupIntervalCron, () => {
        createBackup(options, borgEnv)
            .catch(err => console.error(err));
    });
    cron.schedule(options.cleanupIntervalCron, () => {
        cleanupBackup(options, borgEnv)
            .catch(err => console.error(err));
    });
}

async function initBorgRepo(options: IOptions, borgEnv: IBorgEnv) {
    await run('borg', ['init', '--encryption=repokey', getBorgRepoSelektor(options)], borgEnv, false);
}

async function createBackup(options: IOptions, borgEnv: IBorgEnv) {
    const backupName = (new Date()).toISOString();
    await run('borg', ['create', `${getBorgRepoSelektor(options)}::${backupName}`, options.backupDir], borgEnv, false);
}

async function cleanupBackup(options: IOptions, borgEnv: IBorgEnv) {
    await run('borg', ['prune', '--keep-within', options.cleanupKeep, getBorgRepoSelektor(options)], borgEnv, false);

}

async function restoreBackup() {

}

async function repoExists(options: IOptions, borgEnv: IBorgEnv) {
    try {
        await run('borg', ['info', getBorgRepoSelektor(options)], borgEnv, false);
        return true;
    } catch (err) {
        return false;
    }
}

function getBorgRepoSelektor(options: IOptions) {
    return `ssh://${options.sshHost}:${options.sshPort}/.${options.borgRepository}`;
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
