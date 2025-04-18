// File to be placed at: wwwroot/js/chart-helper.js

window.chartHelper = {
    forceRedraw: function (elementId) {
        // Force browser reflow/repaint on the element
        const element = document.getElementById(elementId);
        if (element) {
            // Trigger a forced reflow
            element.style.display = 'none';
            void element.offsetHeight; // Trigger reflow
            element.style.display = '';

            console.log("Force redraw called for: " + elementId);
        }
    }
};
