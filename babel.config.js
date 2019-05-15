
// We must use babel.config.js instead of .babelrc because we also want to transpile the test code
// that we import from the main SDK package (see jest.config.js), and .babelrc settings never apply
// to code from other modules.

module.exports = {
  env: {
    test: {
      presets: [
        [
          '@babel/preset-env',
          {
            targets: {
              node: '6'
            }
          }
        ]
      ]
    }
  }
};
