const config = {
    version: '1.0',
    interval: 3000,
    maxComments: 20,
    browser: {
        baseUrl: 'http://127.0.0.1:18791',
        token: '',
        targetId: '',
    },
    watcher: {
        interval: 3000,
        emptySnapshotThreshold: 3,
        emptyParseThreshold: 10,
        staleSnapshotThreshold: 20,
        errorRecoveryThreshold: 3,
    },
};

export default config;
