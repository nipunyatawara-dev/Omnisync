/** Keep in sync with root `appPort.js`. */
export const OMNISYNC_APP_PORT =
  Number(process.env.NEXT_PUBLIC_OMNISYNC_PORT ?? process.env.PORT) || 47821;

export const OMNISYNC_APP_ORIGIN = `http://localhost:${OMNISYNC_APP_PORT}`;
