/* -----------------------------------------------------------------------

Copyright 2017 motrohi

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

------------------------------------------------------------------------ */
"use strict";

// NOTE: #register the global installation of npm -g to the require destination path of node.js#
// bash: export NODE_PATH=(`npm root -g`)
/* windows:
set NODE_PATH=
for /f "usebackq delims=" %a in (`npm root -g`) do set NODE_PATH=%a
echo %NODE_PATH%
*/

// ------------------------------- need imports ------------------------------- //
const fs = require("fs");
const del = require("del");

const gulp = require("gulp");
const tsc = require("gulp-typescript");
const rename = require("gulp-rename");
const greplace = require("gulp-replace");
// source map for codecov.
const sourcemaps = require("gulp-sourcemaps");

const utils = require("./scripts/utils");


// ------------------------------- constant variables ------------------------------- //
/** ts compiled out put. */
const JS_DEST_DIR = "./bin";

/** npm publishing. */
const DISTRIBUTION_DIR = "./dist";
/** webpack version. */
const DISTRIBUTION_PACK_DIR = "./dist-pack";

/** ts source files. */
const TS_FILEs_PATTERN = "./src/ts/**/*.ts";

/** copy transpiled code for dist package. */
const COPY_SCRIPT_FILEs = `${JS_DEST_DIR}/**/*{.js,.d.ts,.js.map}`;


// ------------------------------- shared function ------------------------------- //
/**
 * delete files by "globs" pattern.  
 * done callback(gulp) specified if need.
 * @param {string|string[]} globs file pattern.
 * @param {() => void} [done] gulp callback function.
 */
function _clean(globs, done) {
    // del(globs, { force: true }).then(paths => {
    //     console.log(`Deleted files and folders:\n${paths.join("\n")}`);
    //     // notify completion of task.
    //     done && done();
    // });
    const paths = del.sync(globs, { force: true });
    console.log(`Deleted files and folders:\n${paths.join("\n")}`);
    // notify completion of task.
    done && done();
}

// /**
//  *  gulp webpack(-js) strip useless webpack code.
//  */
// // no minify code.
// const re_useless_webpack_pattern = /\/[*]+\/\s+__webpack_require__\.d[^]+call\(object, property\).+/; // or \/[*]+\/\s+__webpack_require__\.d[\s\S\n]+call\(object, property\).+
// // minify code.
// const re_useless_webpack_minified_pattern = /,\s?\w\.d\s?=\s?function\(\w,\s?\w,\s?\w\)\s?\{[\s\S]+hasOwnProperty\.call\(\w,\s?\w\);?\s*\}(?=,)/;
// const re_wp_striper = new RegExp(`${re_useless_webpack_pattern.source}|${re_useless_webpack_minified_pattern.source}`);

// for "webpack"
/**
 * strip unnecessary code from webpack uglify
 * 
 * @param {() => void} [done] gulp callback function.
 */
function stripUnnecessaryCode(done) {
    let did_strip = 0;
    // DEVNOTE: see - https://gulpjs.com/docs/en/api/src
    gulp.src(
        ["./bin/index.js", "./bin/bench/index.js", "./bin/web/index.js"], { allowEmpty: true }
    ).pipe( // strip webpack code
        greplace(
            /\/[*]+\/\s+__webpack_require__\.d[^]+call\(object, property\).+|,\s?\w\.d\s?=\s?function\(\w,\s?\w,\s?\w\)\s?\{[\s\S]+hasOwnProperty\.call\(\w,\s?\w\);?\s*\}(?=,)/,
            (/*$0*/) => { did_strip++; return ""; }
        )
    ).pipe(
        gulp.dest(vinyl => utils.convertRelativeDir(vinyl, "."))
    ).on("end", () => {
        did_strip && console.log("strip webpack code. did_strip=%d", did_strip);
        // notify completion of task.
        done && done();
    });
}

/**
 * 
 * @param {() => void} done gulp callback function.
 * @param {string} dest output directory path.
 */
function _dist(done, dest) {
    gulp.src([
        "LICENSE", "package.json", "README.md", "samples/!(core*|typeid-map*|*rm_ws*)",
        // "test/test.ts",
        COPY_SCRIPT_FILEs
    ]).pipe(gulp.dest(vinyl => {
        return utils.convertRelativeDir(vinyl, dest);
    })).on("end", () => {
        // notify completion of task.
        done();
    });
}
const _copyDefinitions = () => {
    // copy ...
    gulp.src(["./src/ts/**/{index,globals}.d.ts", "./src/ts/**/package.json"])
    .pipe(gulp.dest(JS_DEST_DIR)).on("end", () => {
        // notify completion of task.
        console.log("did copy of definitions(.d.ts)");
    });
};

/**
 * generate gulp plugin
 * 
 *   + gulp plugin code is not bundled with webpack, so it needs to be processed separately
 * 
 * @param {() => void} [done] 
 */
const compileGulpPlugin = (done) => {

    // const through = require("through2");
    // const include = () => {
    //     return through.obj(function (file, enc, callback) {
    //         console.log("grmc:tsc:", file.relative);
    //         if (file.relative.indexOf("gulp") !== -1) {
    //             this.push(file);
    //         }
    //         return callback();
    //     });
    // };

    console.log("start compileGulpPlugin");
    const project = tsc.createProject("./tsconfig.json");
    // cannot took dependent source.
    // however, it seems ok if you explicitly list the file with tsconfig.json ("include" etc.
    // const result = project.src() // Compiler option "compileOnSave" requires a value of type boolean. <- "compileOnSave" option...?
    const result = gulp.src("./src/ts/gulp/index.ts")
        .pipe(sourcemaps.init()) // This means sourcemaps will be generated
        .pipe(project());
        // .pipe(include());

    // return result.js.pipe(gulp.dest(JS_DEST_DIR));
    result.pipe(sourcemaps.write(".", { // create map file per .js
        // DEVNOTE: 2019-5-14 - for test coverage, fix: remap-istanbul has incomplete detection of source.
        includeContent: false,
        // sourceRoot: ""
    }))
    .pipe(gulp.dest(vinyl => {
        // DEVNOTE: see tsconfig.json@rootDir
        return utils.convertRelativeDir(vinyl, ".");
    }))
    .on("end", function () {
        console.log("compileGulpPlugin done.");
        done && done();
    });
};

/**
 * 
 * @param {string} webpackConfigPath the webpack config file script id
 * @param {() => void} done callback for gulp task chain
 */
function doWebpack(webpackConfigPath, done) {
    // const webpackStream = require("webpack-stream");
    const webpack = require("webpack");
    /** @type {import("webpack").Configuration[]} */
    const webpackConfig = require(webpackConfigPath);

    // gulp webpack -no-minify
    settings["no-minify"] && (webpackConfig[0].optimization = webpackConfig[1].optimization = {});
    // copy ...
    _copyDefinitions();

    // const compiler =
    webpack(webpackConfig, (error, stats) => {
        if (error) {
            console.log(error);
            return;
        }
        console.log("webpack build done.");
        compileGulpPlugin();
        stripUnnecessaryCode(done); // <- this is a bit slow...
    });
    // // webpack instance pass to param 2
    // // - - - - web build
    // webpackStream(
    //     webpackConfig[0], webpack,
    //     // (err, stats) => {
    //     //     console.log("Error:", err);
    //     //     console.log(stats.toJson("normal"));
    //     // }
    // ).pipe(
    //     // DEVNOTE: ⚠️ gulp.dest forces change output directory. (ignore webpack.config.js@output.path)
    //     gulp.dest(JS_DEST_DIR + "/web")
    // ).on("end", function() {
    //     console.log("webpack 'web' build done.");
    // });

    // // - - - - node build
    // webpackStream(
    //     webpackConfig[1], webpack,
    // ).pipe(
    //     gulp.dest(JS_DEST_DIR)
    // ).on("end", function() {
    //     console.log("webpack 'node' build done.");
    //     compileGulpPlugin();
    // });
}
// if need optional parametar.
const settings = utils.getExtraArgs();

// ---------------------------------- tasks ---------------------------------- //
/**
 * task "clean"
 * @param {() => void} done gulp callback function.
 */
gulp.task("clean", function(done) {
    _clean([DISTRIBUTION_DIR, DISTRIBUTION_PACK_DIR, JS_DEST_DIR], done);
});

/**
 * task "tsc"
 * @param {() => void} done gulp callback function.
 */
gulp.task("tsc", gulp.series("clean", function(done) {
    // copy ...
    _copyDefinitions();

    const project = tsc.createProject("./tsconfig.json");
    // cannot took dependent source.
    // however, it seems ok if you explicitly list the file with tsconfig.json ("include" etc.
    // const result = project.src() // Compiler option "compileOnSave" requires a value of type boolean. <- "compileOnSave" option...?
    const result = gulp.src(TS_FILEs_PATTERN)
        .pipe(sourcemaps.init()) // This means sourcemaps will be generated
        .pipe(project());

    // return result.js.pipe(gulp.dest(JS_DEST_DIR));
    result // .pipe(sourcemaps.write()) // Now the sourcemaps are added to the .js file
    // 
    // DEVNOTE: 2019-5-13
    //  [about WriteOption]:
    //    It seems that the "sourceRoot" property is basically unnecessary.
    //    Also, if the value of "sourceRoot" is set to empty string or not specified,
    //    creation of coverage report (html) to typescript source will fail.
    //
    //    *This behavior seems to be the same when setting the "sourceRoot" property in tsconfig.json.
    // 
    .pipe(sourcemaps.write(".", { // create map file per .js
        // DEVNOTE: 2019-5-14 - for test coverage, fix: remap-istanbul has incomplete detection of source.
        // includeContent: true,
        // sourceRoot: ""
    }))
    .pipe(gulp.dest(JS_DEST_DIR))
    .on("end", function () {
        console.log("- - - tsc done.");
        done && done();
    });
}));

/**
 * remove file when size is zero. (.d.ts etc)
 * @param {() => void} done gulp callback function.
 */
gulp.task("gulp:tsc", gulp.series("tsc", function (done) {
    const webpack = require("webpack");
    /** @type {import("webpack").Configuration[]} */
    const webpackConfig = require("./webpack.config");
    // gulp webpack -no-minify
    settings["no-minify"] && (webpackConfig[0].optimization = {});
    // build web version only
    console.log("- - - start web version build.");
    webpack(webpackConfig[0], (error, stats) => {
        if (error) {
            console.log(error);
            return;
        }
        console.log("- - - web version build done.");
        stripUnnecessaryCode(done);
    });
}));


// tsc -> gulp:tsc -> webpack
gulp.task("webpack-js", gulp.series("gulp:tsc", (done) => {
    doWebpack("./webpack.configjs", done);
}));
// transpile tsc with webpack.
gulp.task("webpack", gulp.series("clean", (done) => {
    doWebpack("./webpack.config", done);
}));

/**
 * task "dist"
 * without webpack
 */
gulp.task("dist", gulp.series("gulp:tsc", function(done) {
    _dist(done, DISTRIBUTION_DIR);
}));
/**
 * distribution build task.  
 * optional flag: -no-minify
 */
gulp.task("dist:pack", gulp.series("webpack", function(done) {
    try {
        _dist(done, DISTRIBUTION_PACK_DIR);
    } catch (e) {
        console.log(e.message);
    }
}));
/**
 * distribution build task.  
 * optional flag: -no-minify
 */
gulp.task("dist:packjs", gulp.series("webpack-js", function(done) {
    _dist(done, DISTRIBUTION_PACK_DIR);
}));

/**
 * task "readme"  
 * 
 * when executing by itself, it is necessary to write out the necessary data file.  
 * all processing can be completed by "emit-readme" command.
 */
gulp.task("readme", function(cb) {

    let NODE_LATEST_LOG = fs.readFileSync("./logs/node-latest.log", "utf-8");
    let NODE_OLD_LOG = fs.readFileSync("./logs/node-old.log", "utf-8");

    const SIZE = fs.statSync("./samples/es6.js").size;
    const re_package_desc = /(rm-cstyle-cmts@(?:[\d.]+)\s(?:[\w-]+))\s.+/;
    const re_version = /^v\d+\.\d+\.\d+$/m;
    // prepare for readme.
    NODE_LATEST_LOG = NODE_LATEST_LOG.replace(re_package_desc, "$1").replace(/^\s+|\s+$|\r/g, "");
    NODE_OLD_LOG = NODE_OLD_LOG.replace(re_package_desc, "$1").replace(/^\s+|\s+$|\r/g, "");

    const NODE_LATEST_V = re_version.exec(NODE_LATEST_LOG)[0];
    const NODE_OLD_V =  re_version.exec(NODE_OLD_LOG)[0];
    // create readme.md form template.
    gulp.src("./readme-template.md")
    .pipe(
        greplace(/@(SIZE|NODE_LATEST_V|NODE_LATEST_LOG|NODE_OLD_V|NODE_OLD_LOG)/g, (matched, tag) => {
            switch(tag) {
                case "SIZE": return SIZE.toLocaleString();
                case "NODE_LATEST_V": return NODE_LATEST_V;
                case "NODE_OLD_V": return NODE_OLD_V;
                case "NODE_LATEST_LOG": return NODE_LATEST_LOG;
                case "NODE_OLD_LOG": return NODE_OLD_LOG;
            }
            return matched;
        })
    )
    .pipe(rename("README.md"))
    .pipe(gulp.dest("./")).on("end", () => {
        // notify completion of task.
        cb();
        console.log("Please run 'npm run dist'");
    });
});



gulp.task("default", gulp.series("dist", function (done) {
    done();
}));
