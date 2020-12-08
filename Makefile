# Windows:
# .\node_modules\.bin\browserify .\lib\index.js -o .\dav.js --standalone dav -t [ babelify --presets [ @babel/preset-env ] --plugins [ @babel/plugin-transform-classes @babel/plugin-transform-runtime ] ]
build: node_modules
	rm -rf dav.js
	./node_modules/.bin/browserify ./lib/index.js -o dav.js \
	--standalone dav \
	-t [ babelify --presets [ @babel/preset-env ] \
	--plugins [ @babel/plugin-transform-classes @babel/plugin-transform-runtime ] ]

node_modules: package.json
	npm install

.PHONY: clean
clean:
	rm -rf *.zip SabreDAV build coverage dav.* node_modules test/integration/server/SabreDAV

.PHONY: test
test: test-unit

.PHONY: test-unit
test-unit: node_modules
	./node_modules/.bin/mocha -u tdd --require @babel/register test/unit

.PHONY: toc
toc: node_modules
	./node_modules/.bin/doctoc CONTRIBUTING.md
	./node_modules/.bin/doctoc HISTORY.md
	./node_modules/.bin/doctoc README.md
