import { spawn } from "child_process";
/**
 * Executes an Process
 *
 * @param {string} executable the application to execute
 * @param {string[]} args the args for the application
 * @param {*} [env] environment variables for child-process
 * @param {boolean} [readStdIO] should stdout be returned as a string? If not. StdOut will be inherited from node process
 * @returns {Promise<void>} resolves the Promise, if the program has exited
 */
export function run(executable: string, args: string[], env?: { [key: string]: any }): Promise<void>;
export function run(executable: string, args: string[], env?: { [key: string]: any }, readStdIO?: false, cwd?: string): Promise<void>;
export function run(executable: string, args: string[], env?: { [key: string]: any }, readStdIO?: true, cwd?: string): Promise<string>;
export function run(executable: string, args: string[], env?: { [key: string]: any }, readStdIO?: boolean, cwd?: string): Promise<string | void> {
    return (new Promise((resolve, reject) => {
        let childProcess = spawn(executable, args, {
            stdio: [
                "pipe", // StdIn.
                (readStdIO ? "pipe" : "inherit"),    // StdOut.
                "inherit",    // StdErr.
            ],
            env: env ? { ...process.env, ...env } : process.env,
            cwd: cwd ? cwd : process.cwd(),
        });
        let result = "";
        if (readStdIO) {
            childProcess.stdout?.on("data", (data) => result += data);
        }
        childProcess.on("close", (code) => {
            if (code !== 0) {
                reject(new Error(`The command '${executable}', exited with the unsuccessful statuscode '${code}'.`));
            }
            if (readStdIO) {
                resolve(result);
            }
            resolve(undefined);
        });
    }));
}