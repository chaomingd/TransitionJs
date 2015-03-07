define(['./utils'], function(utils) {

    /**
     * TransitionProperty(property, from, to[, arg1[, arg2[, arg3[, arg4]]]])
     *
     * The argN arguments are used as transition-delay, transition-duration, transition-timing-function and
     * transitionend callback.
     *
     * The first argN value that can be parsed as a time is assigned to the transition-duration, and the second value
     * that can be parsed as a time is assigned to transition-delay.
     * Otherwise, if the argN value that can't be parsed as a time, then if it is a string it is assigned to
     * transition-timing-function, otherwise, if it is a function it is called from the transitionend event handler or
     * when property is restarted as a consequence of transition override.
     *
     * TransitionProperty(options)
     * options.property
     * options.from
     * options.to
     * options.duration: assigned to the transition-duration
     * options.delay: assigned to the transition-delay
     * options.timingFunction: assigned to the transition-timing-function
     * options.onTransitionEnd: called from the transitionend event handler
     * options.beginFromCurrentValue: boolean flag indicating whether transition of this property should continue
     *      another ongoing transition from its current value. If no other transition already transitions this property
     *      this flag is ignored.
     *
     * @constructor
     */
    function TransitionProperty() {
        var i, argument, obj = null, arr = null,
            timeRegExp = /[-+]?\d+(?:.\d+)?(?:s|ms)/i,
            durationSet = false;

        if (arguments.length === 1) {
            if (utils.isArray(arguments[0])) {
                arr = arguments[0];
            } else {
                obj = arguments[0];
            }
        } else {
            arr = arguments;
        }

        if (obj) {
            this.property = obj.property;
            this.from = obj.from;
            this.to = obj.to;
            this.duration = (utils.isString(obj.duration) && timeRegExp.test(obj.duration)) ? obj.duration : null;
            this.delay = (utils.isString(obj.delay) && timeRegExp.test(obj.delay)) ? obj.delay : null;
            this.timingFunction = (utils.isString(obj.timingFunction)) ? obj.timingFunction : null;
            this.onTransitionEnd = utils.isFunction(obj.onTransitionEnd) ? obj.onTransitionEnd : null;
            this.beginFromCurrentValue = utils.isBoolean(obj.beginFromCurrentValue) ? obj.beginFromCurrentValue : null;
        } else if (arr.length >= 3) {
            this.property = arr[0];
            this.from = arr[1];
            this.to = arr[2];
            this.duration = null;
            this.delay = null;
            this.timingFunction = null;
            this.onTransitionEnd = null;
            this.beginFromCurrentValue = null;
            for (i = 3; i < arr.length; i++) {
                argument = arr[i];
                if (utils.isString(argument)) {
                    if (timeRegExp.test(argument)) {
                        if (!durationSet) {
                            durationSet = true;
                            this.duration = argument;
                        } else {
                            this.delay = argument;
                        }
                    } else {
                        this.timingFunction = argument;
                    }
                } else if (utils.isFunction(argument)) {
                    this.onTransitionEnd = argument;
                }
            }
        } else {
            throw "[TransitionProperty] Invalid number of arguments."
        }

        this.domProperty = utils.supportedCssProperty(this.property);
        this.cssProperty = utils.domToCSS(this.domProperty);
    }

    function Transition(properties, options) {
        if (!properties) {
            throw "Transition: 'properties' is a required parameter";
        }

        options = utils.defaults(options || {}, Transition.defaultOptions);
        this.properties = properties;
        this.duration = options.duration;
        this.delay = options.delay;
        this.timingFunction = options.timingFunction;
        this.onTransitionEnd = options.onTransitionEnd;
        this.onBeforeChangeStyle = options.onBeforeChangeStyle;
        this.onAfterChangeStyle = options.onAfterChangeStyle;
        this.beginFromCurrentValue = utils.isBoolean(options.beginFromCurrentValue) ? options.beginFromCurrentValue : true;
        this.toBeTransitionedPropertyNames = [];
        this.toBeTransitionedProperties = [];
        this.transitioningPropertyNames = [];
        this.transitioningProperties = [];
        this.allPropertiesWereFinished = true;
    }

    Transition.defaultOptions = {
        duration: '400ms',
        delay: '0s',
        timingFunction: 'ease',
        onTransitionEnd: null,
        onBeforeChangeStyle: null,
        onAfterChangeStyle: null
    };

    /**
     * Applies CSS transition on specified element using properties other transition related data specified in options.
     *
     * @param {HTMLElement} element
     * @param {Object} options
     * @param {Array} options.properties
     * @param {String} options.duration
     * @param {String} options.delay
     * @param {String} options.timingFunction
     * @param {Function} options.onBeforeChangeStyle
     * @param {Function} options.onAfterChangeStyle
     * @param {Function} options.onTransitionEnd
     */
    Transition.transition = function(element, options) {
        var transition, i, property, properties = [];

        if (utils.isArray(options.properties)) {
            // properties: [ ... ]
            for (i = 0; i < options.properties.length; i++) {
                property = options.properties[i];
                if (utils.isArray(property) || !(property instanceof TransitionProperty)) {
                    // properties: [ ["opacity", 0, 1], [ ... ], ... ]
                    // properties: [ {property: "opacity", from: 0, to: 1}, { ... }, ... ]
                    property = new TransitionProperty(property);
                }
                // If not above, then property is instance of TransitionProperty
                // properties: [new TransitionProperty("opacity", 0, 1)]
                properties.push(property);
            }
        } else {
            // properties: { ... }
            for (property in options.properties) {
                if (options.properties.hasOwnProperty(property)) {
                    if (utils.isArray(options.properties[property])) {
                        // properties: { "opacity": [0, 1], ... }
                        property = [property].concat(options.properties[property]);
                        property = new TransitionProperty(property);
                    } else {
                        // properties: { "opacity": {from: 0, to: 1}, ... }
                        property = utils.defaults({"property": property}, options.properties[property]);
                        property = new TransitionProperty(property);
                    }
                    properties.push(property);
                }
            }
        }

        transition = new Transition(properties, options);
        transition.beginTransition(element);
    };

    Transition.getElementTransitionValues = function(element) {
        var i, commaRegExp = /\s*,\s*/,
            transitionPropertyCSS,
            transitionDurationCSS,
            transitionDelayCSS,
            transitionTimingFunctionCSS,
            cssProperties = [],
            durations = [],
            delays = [],
            timingFunctions = [],
            cssPropertiesLength,
            durationsLength,
            delaysLength,
            timingFunctionsLength;

        transitionPropertyCSS = element.style[utils.transitionProperty];

        // If the element has no specified properties in transition-property then do not get the rest of transition-*
        // properties and leave them empty. Otherwise, get the rest of transition-* properties and fill them to the
        // length of transition-property by repeating their values. Do we really need this?
        // https://developer.mozilla.org/en-US/docs/Web/Guide/CSS/Using_CSS_transitions#When_property_value_lists_are_of_different_lengths
        if (transitionPropertyCSS) {

            transitionDurationCSS = element.style[utils.transitionDuration];
            transitionDelayCSS = element.style[utils.transitionDelay];
            transitionTimingFunctionCSS = element.style[utils.transitionTimingFunction];

            cssProperties   = transitionPropertyCSS.split(commaRegExp);
            durations       = transitionDurationCSS       ? transitionDurationCSS.split(commaRegExp)       : ["0s"];
            delays          = transitionDelayCSS          ? transitionDelayCSS.split(commaRegExp)          : ["0s"];
            timingFunctions = transitionTimingFunctionCSS ? transitionTimingFunctionCSS.split(commaRegExp) : ["ease"];

            cssPropertiesLength = cssProperties.length;
            durationsLength = durations.length;
            delaysLength = delays.length;
            timingFunctionsLength = timingFunctions.length;

            for (i = 0; i < cssPropertiesLength; i++) {
                if (durationsLength <= i) {
                    durations.push(durations[i % durationsLength]);
                }
                if (delaysLength <= i) {
                    delays.push(delays[i % delaysLength]);
                }
                if (timingFunctionsLength <= i) {
                    timingFunctions.push(timingFunctions[i % timingFunctionsLength]);
                }
            }
        }

        return {
            cssProperties: cssProperties,
            durations: durations,
            delays: delays,
            timingFunctions: timingFunctions
        }
    };

    Transition.setElementTransitionValues = function(element, transitions) {
        element.style[utils.transitionProperty] = transitions.cssProperties.join(", ");
        element.style[utils.transitionDuration] = transitions.durations.join(", ");
        element.style[utils.transitionDelay] = transitions.delays.join(", ");
        element.style[utils.transitionTimingFunction] = transitions.timingFunctions.join(", ");
    };

    Transition.prototype = {

        constructor: Transition,

        beginTransition: function(element) {
            var i, property;

            this.finishTransitioningPropertiesIfExist(element);

            // Must ensure that all transition properties have "from" values. Otherwise we wouldn't be able to check
            // if a property has equal "from" and "to" values and not to transition them. Their "transitionend" event
            // wouldn't be called anyway.
            for (i = 0; i < this.properties.length; i++) {
                property = this.properties[i];
                if (!utils.isString(property.from) && !utils.isNumber(property.from)) {
                    property.from = window.getComputedStyle(element, null).getPropertyValue(property.cssProperty);
                }
            }

            for (i = 0; i < this.properties.length; i++) {
                property = this.properties[i];
                if (property.from == property.to) {
                    element.style[property.domProperty] = property.to;
                    this.executeOnTransitionEndForProperty(property, element, true);
                } else {
                    element.style[property.domProperty] = property.from;
                    this.toBeTransitionedPropertyNames.push(property.cssProperty);
                    this.toBeTransitionedProperties.push(property);
                }
            }

            if (utils.isFunction(this.onBeforeChangeStyle)) {
                this.onBeforeChangeStyle(element);
            }

            if (this.toBeTransitionedProperties.length === 0) {
                if (utils.isFunction(this.onAfterChangeStyle)) {
                    this.onAfterChangeStyle(element);
                }
                this.executeOnTransitionEnd(element, true);
                return;
            }

            // Trigger reflow
            // noinspection BadExpressionStatementJS
            element.offsetHeight;

            this.addTransitionEndListener(element);

            utils.executeInNextEventLoop(function() {
                var transitionValues, i, property;

                // If other transition began after this one in the same event loop, they could cause
                // toBeTransitionedProperties of this transition to be removed and thus end this transition.
                // No need to call "onAfterChangeStyle" and "removeTransitionEndListener" as they were already called
                // from "finishToBeTransitionedProperties".
                if (this.toBeTransitionedProperties.length === 0) {
                    return;
                }

                // Trigger reflow
                // noinspection BadExpressionStatementJS
                // element.offsetHeight;
                // this.beforeChangeStyle(element)

                // from http://www.w3.org/TR/css3-transitions/#starting
                // when one of these ‘transition-*’ properties changes at the same time as a property whose change might
                // transition, it is the new values of the ‘transition-*’ properties that control the transition.

                transitionValues = Transition.getElementTransitionValues(element);
                for (i = 0; i < this.toBeTransitionedProperties.length; i++) {
                    property = this.toBeTransitionedProperties[i];
                    transitionValues.cssProperties.push(property.cssProperty);
                    transitionValues.durations.push(property.duration || this.duration);
                    transitionValues.delays.push(property.delay || this.delay);
                    transitionValues.timingFunctions.push(property.timingFunction || this.timingFunction);
                }
                this.transitioningPropertyNames = this.toBeTransitionedPropertyNames;
                this.transitioningProperties = this.toBeTransitionedProperties;
                this.toBeTransitionedPropertyNames = [];
                this.toBeTransitionedProperties = [];
                Transition.setElementTransitionValues(element, transitionValues);

                for (i = 0; i < this.transitioningProperties.length; i++) {
                    property = this.transitioningProperties[i];
                    element.style[property.domProperty] = property.to;
                }

                // Trigger reflow
                // noinspection BadExpressionStatementJS
                // element.offsetHeight;
                if (utils.isFunction(this.onAfterChangeStyle)) {
                    this.onAfterChangeStyle(element);
                }

            }, this);

        },

        handleEvent: function(event) {
            // Compare event.target to event.currentTarget to ensure that this event is targeted to this element and
            // not one of its descendants elements that also listen to this event, and then bubbled up.
            // Because an element can have multiple transitions at once, check that the css property this event related
            // to is one of the transitioning properties of this transition.
            if (event.target === event.currentTarget && this.hasTransitioningProperty(event.propertyName)) {
                this.finishTransitioningProperty(event.currentTarget, event.propertyName);
            }
        },

        hasTransitioningProperty: function(propertyName) {
            return this.transitioningPropertyNames.indexOf(propertyName) >= 0;
        },

        removeTransitioningProperty: function(propertyName) {
            var property, index;
            index = this.transitioningPropertyNames.indexOf(propertyName);
            if (index < 0) {
                throw "[Transition.removeTransitioningProperty]: Transition does not have transitioning property '" + propertyName + "'";
            }
            this.transitioningPropertyNames.splice(index, 1);
            this.transitioningProperties.splice(index, 1);
        },

        hasToBeTransitionedProperty: function(propertyName) {
            return this.toBeTransitionedPropertyNames.indexOf(propertyName) >= 0;
        },

        removeToBeTransitionedProperty: function(propertyName) {
            var index;
            index = this.toBeTransitionedPropertyNames.indexOf(propertyName);
            if (index < 0) {
                throw "[Transition.removeToBeTransitionedProperty]: Transition does not have toBeTransitionedProperty '" + propertyName + "'";
            }
            this.toBeTransitionedPropertyNames.slice(index, 1);
            this.toBeTransitionedProperties.splice(index, 1);
        },

        getPropertyByPropertyName: function(propertyName) {
            var i;
            for (i = 0; i < this.properties.length; i++) {
                if (this.properties[i].cssProperty === propertyName) {
                    return this.properties[i];
                }
            }
            throw "[Transition.getPropertyByPropertyName]: Transition does not have property '" + propertyName + "'";
        },

        finishTransitioningProperty: function(element, propertyName) {
            var index, transitionValues, property;

            this.removeTransitioningProperty(propertyName);

            transitionValues = Transition.getElementTransitionValues(element);

            index = transitionValues.cssProperties.indexOf(propertyName);
            if (index < 0) {
                throw "[Transition.removeTransitionProperty]: Did not find transitionProperty '" + propertyName + "'";
            }
            transitionValues.cssProperties.splice(index, 1);
            transitionValues.durations.splice(index, 1);
            transitionValues.delays.splice(index, 1);
            transitionValues.timingFunctions.splice(index, 1);

            Transition.setElementTransitionValues(element, transitionValues);

            property = this.getPropertyByPropertyName(propertyName);
            this.executeOnTransitionEndForProperty(property, element, true);

            if (this.transitioningProperties.length === 0) {
                this.removeTransitionEndListener(element, false);
            }
        },

        finishTransitioningPropertiesIfExist: function(element) {
            var i, j, transitionValues, transitions, transition, transitioningProperties, toBeTransitionedProperties,
                found = false;

            if (!element.hasOwnProperty("_transitions") || element._transitions.length === 0) {
                return;
            }

            transitionValues = Transition.getElementTransitionValues(element);
            transitions = element._transitions;
            for (i = 0; i < transitions.length; i++) {
                transition = transitions[i];
                transitioningProperties = [];
                toBeTransitionedProperties = [];
                for (j = 0; j < this.properties.length; j++) {
                    if (transition.hasTransitioningProperty(this.properties[j].cssProperty)) {
                        transitioningProperties.push(this.properties[j]);
                    } else if (transition.hasToBeTransitionedProperty(this.properties[j].cssProperty)) {
                        toBeTransitionedProperties.push(this.properties[j]);
                    }
                }
                if (transitioningProperties.length) {
                    found = true;
                    transition.allPropertiesWereFinished = false;
                    transition.finishTransitioningProperties(element, transitioningProperties, transitionValues, this.beginFromCurrentValue);
                } else if (toBeTransitionedProperties.length) {
                    transition.allPropertiesWereFinished = false;
                    transition.finishToBeTransitionedProperties(element, toBeTransitionedProperties, this.beginFromCurrentValue);
                }
            }

            // Apply new transition values if some element transitions values were removed
            if (found) {
                Transition.setElementTransitionValues(element, transitionValues);
            }
        },

        finishTransitioningProperties: function(element, properties, transitionValues, beginFromCurrentValue) {
            var i, index, newProperty, oldProperty, propertyName;

            for (i = 0; i < properties.length; i++) {
                newProperty = properties[i];
                propertyName = newProperty.cssProperty;

                this.removeTransitioningProperty(propertyName);
                this.updateFromToCurrentValueIfNeeded(element, newProperty, beginFromCurrentValue);

                index = transitionValues.cssProperties.indexOf(propertyName);
                if (index < 0) {
                    throw "[Transition.removeTransitionProperty]: Did not find transitionProperty '" + propertyName + "'";
                }
                transitionValues.cssProperties.splice(index, 1);
                transitionValues.durations.splice(index, 1);
                transitionValues.delays.splice(index, 1);
                transitionValues.timingFunctions.splice(index, 1);

                oldProperty = this.getPropertyByPropertyName(propertyName);
                this.executeOnTransitionEndForProperty(oldProperty, element, false);
            }

            if (this.transitioningProperties.length === 0) {
                this.removeTransitionEndListener(element, true);
            }
        },

        finishToBeTransitionedProperties: function(element, properties, beginFromCurrentValue) {
            var i, newProperty, oldProperty, propertyName;

            for (i = 0; i < properties.length; i++) {
                newProperty = properties[i];
                propertyName = newProperty.cssProperty;

                this.removeToBeTransitionedProperty(propertyName);
                this.updateFromToCurrentValueIfNeeded(element, newProperty, beginFromCurrentValue);

                oldProperty = this.getPropertyByPropertyName(propertyName);
                this.executeOnTransitionEndForProperty(oldProperty, element, false);
            }

            if (this.toBeTransitionedProperties.length === 0) {
                if (utils.isFunction(this.onAfterChangeStyle)) {
                    this.onAfterChangeStyle(element);
                }
                this.removeTransitionEndListener(element, true);
            }
        },

        updateFromToCurrentValueIfNeeded: function(element, property, beginFromCurrentValue) {
            var isBoolean = utils.isBoolean(property.beginFromCurrentValue);
            if (isBoolean && property.beginFromCurrentValue || !isBoolean && beginFromCurrentValue) {
                property.from = window.getComputedStyle(element, null).getPropertyValue(property.cssProperty);
            }
        },

        addTransitionEndListener: function(element) {
            if (!element.hasOwnProperty("_transitions")) {
                element._transitions = [];
            }

            element._transitions.push(this);
            element.addEventListener(utils.transitionEndEvent, /** @type EventListener */ this, false);
        },

        removeTransitionEndListener: function(element, useNewExecutionContext) {
            var index;

            if (!element.hasOwnProperty("_transitions")) {
                throw "element does not have own _transitions property";
            }

            index = element._transitions.indexOf(this);
            if (index < 0) {
                throw "Can't remove non existing transition from an element";
            }

            element._transitions.splice(index, 1);
            element.removeEventListener(utils.transitionEndEvent, /** @type EventListener */ this, false);

            this.executeOnTransitionEnd(element, useNewExecutionContext);
        },

        executeOnTransitionEndForProperty: function(property, element, finished) {
            var onTransitionEnd;
            if (utils.isFunction(property.onTransitionEnd)) {
                onTransitionEnd = property.onTransitionEnd;
                utils.executeInNextEventLoop(function() {
                    onTransitionEnd(element, finished);
                });
            }
        },

        executeOnTransitionEnd: function(element, useNewExecutionContext) {
            var onTransitionEnd;
            if (utils.isFunction(this.onTransitionEnd)) {
                onTransitionEnd = this.onTransitionEnd;
                if (useNewExecutionContext) {
                    utils.executeInNextEventLoop(function() {
                        onTransitionEnd(element, this.allPropertiesWereFinished);
                    }, this);
                } else {
                    onTransitionEnd(element, this.allPropertiesWereFinished);
                }
            }

        }

    };

    return {
        TransitionProperty: TransitionProperty,
        transition: Transition.transition,
        begin: Transition.transition
    };

});