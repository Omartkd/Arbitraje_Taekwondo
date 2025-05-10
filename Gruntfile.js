module.exports = function(grunt) {
  grunt.initConfig({
    clean: ['dist/'],
    copy: {
      main: {
        files: [
          {expand: true, src: ['public/**'], dest: 'dist/'},
          {expand: true, src: ['server.js'], dest: 'dist/'}
        ]
      }
    },
    uglify: {
      options: {
        mangle: true
      },
      target: {
        files: {
          'dist/public/js/app.min.js': ['public/js/**/*.js']
        }
      }
    }
  });

  grunt.loadNpmTasks('grunt-contrib-clean');
  grunt.loadNpmTasks('grunt-contrib-copy');
  grunt.loadNpmTasks('grunt-contrib-uglify');

  grunt.registerTask('build', ['clean', 'copy', 'uglify']);
};
