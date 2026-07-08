/** Keep in sync with root `appPort.js`. Never read generic PORT — it leaks into other projects. */
export const OMNISYNC_APP_PORT =
  Number(process.env.NEXT_PUBLIC_OMNISYNC_PORT) || 47821;

export const OMNISYNC_APP_ORIGIN = `http://localhost:${OMNISYNC_APP_PORT}`;
