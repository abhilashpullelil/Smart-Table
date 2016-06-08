/** 
* @version 2.1.7
* @license MIT
*/
(function (ng, undefined) {
    'use strict';

    ng.module('smart-table', []).run(['$templateCache', function ($templateCache) {
        $templateCache.put('template/smart-table/pagination.html',
            '<nav ng-if="pages.length >= 2"><ul class="pagination">' +
            '<li ng-repeat="page in pages" ng-class="{active: page==currentPage}"><a ng-click="selectPage(page)">{{page}}</a></li>' +
            '</ul></nav>');
    }]);


    ng.module('smart-table')
      .constant('stConfig', {
          pagination: {
              template: 'template/smart-table/pagination.html',
              itemsByPage: 10,
              displayedPages: 5
          },
          search: {
              delay: 400 // ms
          },
          select: {
              mode: 'single',
              selectedClass: 'st-selected'
          },
          sort: {
              ascentClass: 'st-sort-ascent',
              descentClass: 'st-sort-descent'
          }
      });
    ng.module('smart-table')
      .controller('stTableController', ['$scope', '$parse', '$filter', '$attrs', function StTableController($scope, $parse, $filter, $attrs) {
          var propertyName = $attrs.stTable;
          var displayGetter = $parse(propertyName);
          var displaySetter = displayGetter.assign;
          var safeGetter;
          var orderBy = $filter('orderBy');
          var filter = $filter('filter');
          var safeCopy = copyRefs(displayGetter($scope));
          var tableState = {
              sort: {},
              search: {},
              pagination: {
                  start: 0
              },
              group: {

              }
          };
          var filtered;
          var pipeAfterSafeCopy = true;
          var ctrl = this;
          var lastSelected;

          function copyRefs(src) {
              return src ? [].concat(src) : [];
          }

          function updateSafeCopy() {
              safeCopy = copyRefs(safeGetter($scope));
              if (pipeAfterSafeCopy === true) {
                  ctrl.pipe();
              }
          }

          if ($attrs.stSafeSrc) {
              safeGetter = $parse($attrs.stSafeSrc);
              $scope.$watch(function () {
                  var safeSrc = safeGetter($scope);
                  return safeSrc ? safeSrc.length : 0;

              }, function (newValue, oldValue) {
                  if (newValue !== safeCopy.length) {
                      updateSafeCopy();
                  }
              });
              $scope.$watch(function () {
                  return safeGetter($scope);
              }, function (newValue, oldValue) {
                  if (newValue !== oldValue) {
                      updateSafeCopy();
                  }
              });
          }

          function groupByProperty(collection, property) {
              var output = [];
              var groupReference = {};

              for (var i = 0; i < collection.length; i++) {
                  var item = collection[i];
                  var keyValue = item[property];

                  var group = groupReference[keyValue];

                  if (group === undefined) {
                      group = {
                          key: keyValue,
                          items: []
                      };

                      groupReference[keyValue] = group;
                      output.push(group);
                  }

                  group.items.push(item);
              }

              return output;
          }

          /**
           * sort the rows
           * @param {Function | String} predicate - function or string which will be used as predicate for the sorting
           * @param [reverse] - if you want to reverse the order
           * @param isPercentage - is the column value is percentage or not. If it is percentage then sort the percentage while grouped not sum
           */
          this.sortBy = function sortBy(predicate, reverse, percentageData ) {
              tableState.sort.predicate = predicate;
              tableState.sort.reverse = reverse === true;
              tableState.sort.isPercentage = percentageData.isPercentage;
              tableState.sort.Numerator = percentageData.Numerator;
              tableState.sort.Denominator = percentageData.Denominator;

              if (ng.isFunction(predicate)) {
                  tableState.sort.functionName = predicate.name;
              } else {
                  delete tableState.sort.functionName;
              }

              tableState.pagination.start = 0;
              return this.pipe();
          };

          /**
           * search matching rows
           * @param {String} input - the input string
           * @param {String} [predicate] - the property name against you want to check the match, otherwise it will search on all properties
           */
          this.search = function search(input, predicate) {
              var predicateObject = tableState.search.predicateObject || {};
              var prop = predicate ? predicate : '$';

              input = ng.isString(input) ? input.trim() : input;
              predicateObject[prop] = input;
              // to avoid to filter out null value
              if (!input) {
                  delete predicateObject[prop];
              }
              tableState.search.predicateObject = predicateObject;
              tableState.pagination.start = 0;
              return this.pipe();
          };

          this.groupBy = function groupBy(predicate) {
              tableState.group.predicate = predicate ? predicate : undefined;
              return this.pipe();
          };

          /**
           * this will chain the operations of sorting and filtering based on the current table state (sort options, filtering, ect)
           */
          this.pipe = function pipe() {
              var pagination = tableState.pagination;
              var group = tableState.group;
              var output;
              filtered = tableState.search.predicateObject ? filter(safeCopy, tableState.search.predicateObject) : safeCopy;
              // When sorting is on and group by is off
              if (tableState.sort.predicate && group.predicate === undefined) {
                  filtered = orderBy(filtered, tableState.sort.predicate, tableState.sort.reverse);
              }

              if (group.predicate !== undefined) {
                  filtered = groupByProperty(filtered, group.predicate);
              }
              // When sorting is on and group by is on
              if (tableState.sort.predicate && group.predicate !== undefined) {
                  filtered = orderBy(filtered, function (obj) {
                      
                      if (tableState.sort.isPercentage === true) {
                          var numerator = 0;
                          var denominator = 0;
                          for (var i = 0; i < obj.items.length; i++) {
                              numerator += obj.items[i][tableState.sort.Numerator];
                              denominator += obj.items[i][tableState.sort.Denominator];
                          }
                          var percentage = (numerator / denominator) * 100;
                          return (denominator == 0 ? 0 : percentage);
                      }
                      else {
                          var sum = 0;
                          for (var i = 0; i < obj.items.length; i++) {
                              sum += obj.items[i][tableState.sort.predicate];
                          }
                          return sum;
                      }
                      
                  }, tableState.sort.reverse);
              }

              if (pagination.number !== undefined) {
                  pagination.numberOfPages = filtered.length > 0 ? Math.ceil(filtered.length / pagination.number) : 1;
                  pagination.start = pagination.start >= filtered.length ? (pagination.numberOfPages - 1) * pagination.number : pagination.start;
                  output = filtered.slice(pagination.start, pagination.start + parseInt(pagination.number));
              }

              displaySetter($scope, output || filtered);
          };

          /**
           * select a dataRow (it will add the attribute isSelected to the row object)
           * @param {Object} row - the row to select
           * @param {String} [mode] - "single" or "multiple" (multiple by default)
           */
          this.select = function select(row, mode) {
              var rows = safeCopy;
              var index = rows.indexOf(row);
              if (index !== -1) {
                  if (mode === 'single') {
                      row.isSelected = row.isSelected !== true;
                      if (lastSelected) {
                          lastSelected.isSelected = false;
                      }
                      lastSelected = row.isSelected === true ? row : undefined;
                  } else {
                      rows[index].isSelected = !rows[index].isSelected;
                  }
              }
          };

          /**
           * take a slice of the current sorted/filtered collection (pagination)
           *
           * @param {Number} start - start index of the slice
           * @param {Number} number - the number of item in the slice
           */
          this.slice = function splice(start, number) {
              tableState.pagination.start = start;
              tableState.pagination.number = number;
              return this.pipe();
          };

          /**
           * return the current state of the table
           * @returns {{sort: {}, search: {}, pagination: {start: number}}}
           */
          this.tableState = function getTableState() {
              return tableState;
          };

          this.getFilteredCollection = function getFilteredCollection() {
              return filtered || safeCopy;
          };

          /**
           * Use a different filter function than the angular FilterFilter
           * @param filterName the name under which the custom filter is registered
           */
          this.setFilterFunction = function setFilterFunction(filterName) {
              filter = $filter(filterName);
          };

          /**
           * Use a different function than the angular orderBy
           * @param sortFunctionName the name under which the custom order function is registered
           */
          this.setSortFunction = function setSortFunction(sortFunctionName) {
              orderBy = $filter(sortFunctionName);
          };

          /**
           * Usually when the safe copy is updated the pipe function is called.
           * Calling this method will prevent it, which is something required when using a custom pipe function
           */
          this.preventPipeOnWatch = function preventPipe() {
              pipeAfterSafeCopy = false;
          };
      }])
      .directive('stTable', function () {
          return {
              restrict: 'A',
              controller: 'stTableController',
              link: function (scope, element, attr, ctrl) {

                  if (attr.stSetFilter) {
                      ctrl.setFilterFunction(attr.stSetFilter);
                  }

                  if (attr.stSetSort) {
                      ctrl.setSortFunction(attr.stSetSort);
                  }
              }
          };
      });

    ng.module('smart-table')
      .directive('stSearch', ['stConfig', '$timeout', function (stConfig, $timeout) {
          return {
              require: '^stTable',
              link: function (scope, element, attr, ctrl) {
                  var tableCtrl = ctrl;
                  var promise = null;
                  var throttle = attr.stDelay || stConfig.search.delay;

                  attr.$observe('stSearch', function (newValue, oldValue) {
                      var input = element[0].value;
                      if (newValue !== oldValue && input) {
                          ctrl.tableState().search = {};
                          tableCtrl.search(input, newValue);
                      }
                  });

                  //table state -> view
                  scope.$watch(function () {
                      return ctrl.tableState().search;
                  }, function (newValue, oldValue) {
                      var predicateExpression = attr.stSearch || '$';
                      if (newValue.predicateObject && newValue.predicateObject[predicateExpression] !== element[0].value) {
                          element[0].value = newValue.predicateObject[predicateExpression] || '';
                      }
                  }, true);

                  // view -> table state 
                  // changed from 'input' to 'change'
                  element.bind('input', function (evt) {
                      evt = evt.originalEvent || evt;
                      if (promise !== null) {
                          $timeout.cancel(promise);
                      }

                      promise = $timeout(function () {
                          tableCtrl.search(evt.target.value, attr.stSearch || '');
                          promise = null;
                      }, throttle);
                  });

              }
          };
      }]);

    ng.module("smart-table").directive("stResetSearch", function () {
        return {
            restrict: 'EA',
            require: '^stTable',
            scope: {
                tableFunctions : '='
            },
            link: function (scope, element, attrs, ctrl) {

                scope.tableFunctions = {};
                scope.tableFunctions.resetSearch = function () {
                    var tableState;
                    tableState = ctrl.tableState();
                    tableState.search.predicateObject = {};
                    tableState.pagination.start = 0;
                    return ctrl.pipe();
                }

                //return element.bind('click', function () {
                //    return scope.$apply(function () {
                //        var tableState;
                //        tableState = ctrl.tableState();
                //        tableState.search.predicateObject = {};
                //        tableState.pagination.start = 0;
                //        return ctrl.pipe();
                //    });
                //});
            }
        };
    })

    ng.module('smart-table')
      .directive('stSelectRow', ['stConfig', function (stConfig) {
          return {
              restrict: 'A',
              require: '^stTable',
              scope: {
                  row: '=stSelectRow'
              },
              link: function (scope, element, attr, ctrl) {
                  var mode = attr.stSelectMode || stConfig.select.mode;
                  element.bind('click', function () {
                      scope.$apply(function () {
                          ctrl.select(scope.row, mode);
                      });
                  });

                  scope.$watch('row.isSelected', function (newValue) {
                      if (newValue === true) {
                          element.addClass(stConfig.select.selectedClass);
                      } else {
                          element.removeClass(stConfig.select.selectedClass);
                      }
                  });
              }
          };
      }]);

    ng.module('smart-table')
      .directive('stSort', ['stConfig', '$parse', function (stConfig, $parse) {
          return {
              restrict: 'A',
              require: '^stTable',
              link: function (scope, element, attr, ctrl) {

                  var predicate = attr.stSort;
                  var getter = $parse(predicate);
                  var index = 0;
                  var classAscent = attr.stClassAscent || stConfig.sort.ascentClass;
                  var classDescent = attr.stClassDescent || stConfig.sort.descentClass;
                  var stateClasses = [classAscent, classDescent];
                  var sortDefault;

                  if (attr.stSortDefault) {
                      sortDefault = scope.$eval(attr.stSortDefault) !== undefined ? scope.$eval(attr.stSortDefault) : attr.stSortDefault;
                  }

                  //view --> table state
                  function sort() {
                      index++;
                      predicate = ng.isFunction(getter(scope)) ? getter(scope) : attr.stSort;
                      if (index % 3 === 0 && attr.stSkipNatural === undefined) {
                          //manual reset
                          index = 0;
                          ctrl.tableState().sort = {};
                          ctrl.tableState().pagination.start = 0;
                          ctrl.pipe();
                      } else {
                          var percentageData = {};
                          var isPercentage = attr['stSortPercentage'] !== undefined;
                          if (isPercentage) {
                              percentageData.Numerator = attr['stSortPercentageNumerator'];
                              percentageData.Denominator = attr['stSortPercentageDenominator'];
                          }
                          percentageData.isPercentage = isPercentage;

                          ctrl.sortBy(predicate, index % 2 === 0, percentageData);
                      }
                  }

                  element.bind('click', function sortClick() {
                      if (predicate) {
                          scope.$apply(sort);
                      }
                  });

                  if (sortDefault) {
                      index = sortDefault === 'reverse' ? 1 : 0;
                      sort();
                  }

                  //table state --> view
                  scope.$watch(function () {
                      return ctrl.tableState().sort;
                  }, function (newValue) {
                      if (newValue.predicate !== predicate) {
                          index = 0;
                          element
                            .removeClass(classAscent)
                            .removeClass(classDescent);
                      } else {
                          index = newValue.reverse === true ? 2 : 1;
                          element
                            .removeClass(stateClasses[index % 2])
                            .addClass(stateClasses[index - 1]);
                      }
                  }, true);
              }
          };
      }]);

    ng.module('smart-table')
      .directive('stPagination', ['stConfig', function (stConfig) {
          return {
              restrict: 'EA',
              require: '^stTable',
              scope: {
                  stItemsByPage: '=?',
                  stDisplayedPages: '=?',
                  stPageChange: '&'
              },
              templateUrl: function (element, attrs) {
                  if (attrs.stTemplate) {
                      return attrs.stTemplate;
                  }
                  return stConfig.pagination.template;
              },
              link: function (scope, element, attrs, ctrl) {

                  scope.stItemsByPage = scope.stItemsByPage ? +(scope.stItemsByPage) : stConfig.pagination.itemsByPage;
                  scope.stDisplayedPages = scope.stDisplayedPages ? +(scope.stDisplayedPages) : stConfig.pagination.displayedPages;

                  scope.currentPage = 1;
                  scope.pages = [];

                  function redraw() {
                      var paginationState = ctrl.tableState().pagination;
                      var start = 1;
                      var end;
                      var i;
                      var prevPage = scope.currentPage;
                      scope.currentPage = Math.floor(paginationState.start / paginationState.number) + 1;

                      start = Math.max(start, scope.currentPage - Math.abs(Math.floor(scope.stDisplayedPages / 2)));
                      end = start + scope.stDisplayedPages;

                      if (end > paginationState.numberOfPages) {
                          end = paginationState.numberOfPages + 1;
                          start = Math.max(1, end - scope.stDisplayedPages);
                      }

                      scope.pages = [];
                      scope.numPages = paginationState.numberOfPages;
                      
                      for (i = start; i < end; i++) {
                          scope.pages.push(i);
                      }

                      if (prevPage !== scope.currentPage) {
                          scope.stPageChange({ newPage: scope.currentPage });
                      }

                  }

                  //table state --> view
                  scope.$watch(function () {
                      return ctrl.tableState().pagination;
                  }, redraw, true);

                  //scope --> table state  (--> view)
                  scope.$watch('stItemsByPage', function (newValue, oldValue) {
                      if (newValue !== oldValue) {
                          scope.selectPage(1);
                      }
                  });

                  scope.$watch('stDisplayedPages', redraw);

                  //view -> table state
                  scope.selectPage = function (page) {
                      if (page > 0 && page <= scope.numPages) {
                          ctrl.slice((page - 1) * scope.stItemsByPage, scope.stItemsByPage);
                      }
                  };

                  // Watch the change in the table data
                  scope.$watch(function () {
                      return ctrl.getFilteredCollection();
                  }, function (newVal) {
                      if (newVal != null)
                          scope.totalData = newVal.length;
                  }, true);

                  if (!ctrl.tableState().pagination.number) {
                      ctrl.slice(0, scope.stItemsByPage);
                  }
              }
          };
      }]);

    ng.module('smart-table')
      .directive('stPipe', function () {
          return {
              require: 'stTable',
              scope: {
                  stPipe: '='
              },
              link: {

                  pre: function (scope, element, attrs, ctrl) {
                      if (ng.isFunction(scope.stPipe)) {
                          ctrl.preventPipeOnWatch();
                          ctrl.pipe = function () {
                              return scope.stPipe(ctrl.tableState(), ctrl);
                          };
                      }
                  },

                  post: function (scope, element, attrs, ctrl) {
                      ctrl.pipe();
                  }
              }
          };
      });

    ng.module('smart-table')
      .directive('stGroup', ['stConfig', '$parse', function (stConfig, $parse) {
          return {
              restrict: 'A',
              require: '^stTable',
              scope: {
                  stGroup: '='
              },
              link: function (scope, element, attr, ctrl) {
                  var predicate = scope.stGroup;

                  //view --> table state
                  function group() {
                      ctrl.groupBy(predicate);
                  }

                  // watch the change in the variable which is attached to the st-group
                  scope.$watch('stGroup', function () {
                      predicate = scope.stGroup;

                      group();
                  });
              }
          };
      }]);

})(angular);

