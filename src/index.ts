import { run } from './run';
import { promises } from 'fs';
import yargs from 'yargs';
import * as cron from 'node-cron';
import { join as pathJoin } from 'path';

interface IOptions {
    sshPort: number;
    sshHost: string;
    backupDir: string;
    borgRepository: string;
    sshKeyFile: string;
    borgPassphrase?: string;
    borgPassphraseFile?: string;
    list: boolean;
    backup: boolean;
    cleanup: boolean;
    restore: boolean;
    preBackupHook?: string;
    postBackupHook?: string;
    preRestoreHook?: string;
    postRestoreHook?: string;
    resetKeyPermissions: boolean;
}

interface ICleanupOptions extends IOptions {
    cleanupIntervalCron: string;
    cleanupKeep: string;
}

interface IBackupOptions extends IOptions {
    backupIntervalCron: string;
}
interface IRestoreOptions extends IOptions {
    restoreBackupName: string;
}

interface IBorgEnv {
    BORG_PASSPHRASE: string;
    BORG_RSH: string;
}

async function main() {
    const args = await yargs
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
        .check((args: Partial<IOptions>) => {
            if (args.borgPassphrase || args.borgPassphraseFile) {
                return true
            }
            return 'borgPassphrase and borgPassphraseFile are not set!'
        })
        .option('sshKeyFile', {
            type: 'string',
            demandOption: true,
        })
        .option('list', {
            type: 'boolean',
            description: 'List all created backups',
            default: false,
        })
        .option('backup', {
            type: 'boolean',
            description: 'Run the backup job',
            default: false,
        })
        .option('backupIntervalCron', {
            type: 'string',
            // demandOption: true,
        })
        .implies('backup', 'backupIntervalCron')
        .option('cleanup', {
            type: 'boolean',
            description: 'Run the cleanup job',
            default: false,
        })
        .option('cleanupIntervalCron', {
            type: 'string',
            // demandOption: true,
        })
        .implies('cleanup', 'cleanupIntervalCron')
        .option('cleanupKeep', {
            type: 'string',
            // demandOption: true,
        })
        .implies('cleanup', 'cleanupKeep')
        .option('restore', {
            type: 'boolean',
            description: 'Restore an backup',
            default: false,
        })
        .option('restoreBackupName', {
            type: 'string',
        })
        .implies('restore', 'restoreBackupName')
        .check(args => {
            if (args.backup || args.list || args.cleanup || args.restore) return true;
            throw new Error('at least on mode of --backup --list -- cleanup is required!')
        })
        .option('preBackupHook', {
            type: 'string',
            description: 'The provided command will be run before every backup.',
        })
        .option('postBackupHook', {
            type: 'string',
            description: 'The provided command will be run after every backup.',
        })
        .option('preRestoreHook', {
            type: 'string',
            description: 'The provided command will be run before every restore.',
        })
        .option('postRestoreHook', {
            type: 'string',
            description: 'The provided command will be run after every restore.',
        })
        .option('resetKeyPermissions', {
            type: 'boolean',
            default: true,
            description: 'sets the permissions of the ssh keys at startup',
        })
        .argv;
    let borg_passphrase = args.borgPassphrase;
    if (!borg_passphrase) {
        borg_passphrase = (await promises.readFile(args.borgPassphraseFile!)).toString();
    }
    const borgEnv: IBorgEnv = {
        BORG_PASSPHRASE: borg_passphrase,
        BORG_RSH: `ssh -i ${args.sshKeyFile} -o StrictHostKeyChecking=no`
    };

    if (args.resetKeyPermissions) {
        await run('chmod', ['700', args.sshKeyFile]);
    }

    await ensureRepoExists(args, borgEnv);
    if (isList(args)) {
        await listBackups(args, borgEnv);
    }
    if (isRestore(args)) {
        await restoreBackup(args, borgEnv);
    }
    if (isBackup(args)) {
        console.log(`Staring backup job with crontab "${args.backupIntervalCron}"`);
        cron.schedule(args.backupIntervalCron, () => {
            createBackup(args, borgEnv)
                .catch(err => console.error(err));
        });
    }
    if (isCleanup(args)) {
        console.log(`Staring cleanup job with crontab "${args.cleanupIntervalCron}"`);
        cron.schedule(args.cleanupIntervalCron, () => {
            cleanupBackup(args, borgEnv)
                .catch(err => console.error(err));
        });
    }
}

function isList(args: IOptions): boolean {
    return args.list;
}

function isBackup(args: IOptions): args is IBackupOptions {
    return args.backup;
}

function isCleanup(args: IOptions): args is ICleanupOptions {
    return args.cleanup;
}

function isRestore(args: IOptions): args is IRestoreOptions {
    return args.restore;
}

async function ensureRepoExists(options: IOptions, borgEnv: IBorgEnv) {
    console.log('Checking if borg repository exists.')
    if (!await repoExists(options, borgEnv)) {
        await initBorgRepo(options, borgEnv);
    }
}

async function initBorgRepo(options: IOptions, borgEnv: IBorgEnv) {
    await run('borg', ['init', '--encryption=repokey', getBorgRepoSelektor(options)], borgEnv, false);
}

async function listBackups(options: IOptions, borgEnv: IBorgEnv) {
    console.log('Created backups:')
    await run('borg', ['list', getBorgRepoSelektor(options)], borgEnv, false);
}

async function createBackup(options: IBackupOptions, borgEnv: IBorgEnv) {
    const backupName = (new Date()).toISOString();
    await executeHook(options, 'preBackup');
    console.log(`create backup with name '${backupName}'`);
    await run('borg', ['create', `${getBorgRepoSelektor(options)}::${backupName}`, options.backupDir], borgEnv, false);
    await executeHook(options, 'postBackup');
}

async function cleanupBackup(options: ICleanupOptions, borgEnv: IBorgEnv) {
    console.log(`cleanup backup that are older than ${options.cleanupKeep}`);
    await run('borg', ['prune', '--keep-within', options.cleanupKeep, getBorgRepoSelektor(options)], borgEnv, false);

}

async function restoreBackup(options: IRestoreOptions, borgEnv: IBorgEnv): Promise<void> {
    console.log(`restoring backup '${options.restoreBackupName}'`);
    await executeHook(options, 'preRestore');
    const extractPath = pathJoin(options.backupDir, '..');
    await run('borg', ['extract', `${getBorgRepoSelektor(options)}::${options.restoreBackupName}`], borgEnv, false, extractPath);
    await executeHook(options, 'postRestore');
    console.log(`done`);
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

async function executeHook(options: IOptions, mode: 'preBackup' | 'postBackup' | 'preRestore' | 'postRestore'): Promise<void> {
    let hook =
        mode === 'preBackup' ? options.preBackupHook :
            mode === 'postBackup' ? options.postBackupHook :
                mode === 'preRestore' ? options.preRestoreHook :
                    mode === 'postRestore' ? options.postRestoreHook :
                        undefined;
    if (!hook) {
        return;
    }
    const hookCommand = hook.split(' ');
    await run(hookCommand[0], hookCommand.slice(1));
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
