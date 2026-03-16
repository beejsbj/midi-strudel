import React from 'react';

export const LazyCodeViewer = React.lazy(() =>
  import('../CodeViewer').then((module) => ({ default: module.CodeViewer })),
);
