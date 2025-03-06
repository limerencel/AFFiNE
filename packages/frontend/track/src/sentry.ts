import * as Sentry from '@sentry/react';
import { useEffect } from 'react';
import {
  createRoutesFromChildren,
  matchRoutes,
  useLocation,
  useNavigationType,
} from 'react-router-dom';

function createSentry() {
  let enabled = true;
  const wrapped = {
    init() {
      // https://docs.sentry.io/platforms/javascript/guides/react/#configure
      Sentry.init({
        enabled: enabled,
        dsn: process.env.SENTRY_DSN,
        debug: BUILD_CONFIG.debug ?? false,
        environment: process.env.BUILD_TYPE ?? 'development',
        integrations: [
          Sentry.reactRouterV6BrowserTracingIntegration({
            useEffect,
            useLocation,
            useNavigationType,
            createRoutesFromChildren,
            matchRoutes,
          }),
        ],
        beforeSend(event) {
          return enabled ? event : null;
        },
      });
      Sentry.setTags({
        distribution: BUILD_CONFIG.distribution,
        appVersion: BUILD_CONFIG.appVersion,
        editorVersion: BUILD_CONFIG.editorVersion,
      });
    },
    enable() {
      enabled = true;
    },
    disable() {
      enabled = false;
    },
  };

  return wrapped;
}

export const sentry = createSentry();
