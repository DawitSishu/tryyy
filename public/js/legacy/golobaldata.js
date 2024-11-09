// globalData.js
console.log(45)
const GlobalData = (() => {
    // Private data
    let focusEntity = null;
  
    return {
      // Getter for focusEntity
      getFocusEntity() {
        return focusEntity;
      },
      
      // Setter for focusEntity
      setFocusEntity(entity) {
        focusEntity = entity;
        this.triggerFocus();
      },
      
      // Function to apply focus to a specific element
      triggerFocus() {
        if (focusEntity && focusEntity.focus) {
          focusEntity.focus();  // If the entity is a DOM element with a .focus() method
        }
      }
    };
  })();
  
  // Export it so other scripts can import
  export default GlobalData;
  