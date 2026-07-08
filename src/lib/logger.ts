type LogFn = (scope: string, msg: string, meta?: object) => void;

function format(scope: string, msg: string, meta?: object): string {
  const prefix = `[${scope}] ${msg}`;
  if (!meta || Object.keys(meta).length === 0) return prefix;
  return `${prefix} ${JSON.stringify(meta)}`;
}

export const log = {
  info: ((scope, msg, meta) => {
    console.log(format(scope, msg, meta));
  }) as LogFn,
  warn: ((scope, msg, meta) => {
    console.warn(format(scope, msg, meta));
  }) as LogFn,
  error: ((scope, msg, meta) => {
    console.error(format(scope, msg, meta));
  }) as LogFn,
};
