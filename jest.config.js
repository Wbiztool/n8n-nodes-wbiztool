/** Unit tests (test/), run with `npm test`; not part of the build or the npm package. */
module.exports = {
	preset: 'ts-jest',
	testEnvironment: 'node',
	roots: ['<rootDir>/test'],
	testMatch: ['**/*.test.ts'],
};
