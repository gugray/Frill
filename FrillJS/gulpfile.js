/// <binding BeforeBuild='default' ProjectOpened='watch' />
var browserify = require('browserify');
var gulp = require('gulp');
var gutil = require('gulp-util');
var uglify = require('gulp-uglify');
var source = require('vinyl-source-stream');
var buffer = require('vinyl-buffer');
var minifyCSS = require('gulp-minify-css');
var plumber = require('gulp-plumber');
var less = require('gulp-less');
var path = require('path');
var concat = require('gulp-concat');

gulp.task('scripts', function () {
  var bundle = browserify({
    entries: ['./src/js/main.js'],
    debug: true
  });
  return bundle.bundle()
    .pipe(source('app.js'))
    //.pipe(buffer())
    //.pipe(uglify())
    .pipe(gulp.dest('./public/'));
});

gulp.task('less', function () {
  return gulp.src('./src/less/*.less')
    .pipe(plumber())
    .pipe(less({
      paths: [path.join(__dirname, 'less', 'includes')]
    }))
    .pipe(gulp.dest('./src/css/'));
});

gulp.task('styles', ['less'], function () {
  return gulp.src(['./src/css/*.css'])
    .pipe(minifyCSS())
    .pipe(concat('app.min.css'))
    .pipe(gulp.dest('./public/'));
});


gulp.task('default', ['scripts', 'styles'], function () { });

gulp.task('watch', function () {
  gulp.watch(['./src/less/*.less'], ['styles']);
});
