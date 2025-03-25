const status = require('../../config/config').STATUS;
const { registation, edit, remove, activate_user } = require('./UserLogic');

exports.register = async (req, res) => {
    const { user_name, user_telegram, user_telegram_id } = req.body;
    try {
        console.log("Registration request:", { user_name, user_telegram, user_telegram_id });

        if (!user_name || !user_telegram || !user_telegram_id) {
            return res.status(status.ERROR).json({ 
                message: "Missing required fields", 
                details: {
                    user_name: !!user_name,
                    user_telegram: !!user_telegram,
                    user_telegram_id: !!user_telegram_id
                }
            });
        }

        const result = await registation(user_name, user_telegram, user_telegram_id, 0);
        
        if (result.success === true) {
            return res.status(status.OK).json({ message: result.result });
        } else {
            return res.status(status.ERROR).json({ 
                message: result.result || "Registration failed",
                details: result
            });
        }
    } catch(error) {
        console.error('Registration error:', error);
        return res.status(status.ERROR).json({ 
            message: "Internal server error", 
            details: error.message 
        });
    }
};

exports.edit = async (req, res) => {
    const { user_id, updateField, updateInfo, modified_by } = req.body;

    try {
        console.log(user_id, updateField, updateInfo, !modified_by )

        if (!user_id || !updateField || updateInfo === undefined || updateInfo === null || modified_by === undefined || modified_by === null) {
            return res.status(status.ERROR).json({
                message: "Some fields are empty",
                details: {
                    user_id: !!user_id,
                    updateField: !!updateField,
                    updateInfo: !!updateInfo,
                    modified_by: modified_by !== undefined && modified_by !== null
                }
            });
        }

        const result = await edit(user_id, updateField, updateInfo, modified_by);

        if(result.success === true){
            return res.status(status.OK).json({ message: result.result});
        }
        else{
            return res.status(status.ERROR).json({ 
                message: result.result || "Edit failed",
                details: result
            });
        }
    } catch(error) {
        console.error('Edit error:', error);
        return res.status(status.ERROR).json({ 
            message: "Internal server error", 
            details: error.message 
        });
    }
};

exports.remove_user = async (req, res) => {
    const { user_id, modified_by } = req.body;

    try {
        if( !user_id || modified_by === undefined || modified_by === null){
            return res.status(status.ERROR).json({
                message: "Some fields are empty",
                details: {
                    user_id: !!user_id,
                    modified_by: modified_by !== undefined && modified_by !== null
                }
            });
        }

        const result = await remove(user_id, modified_by);
        
        if(result.success === true){
            return res.status(status.OK).json({ message: result.result});
        }
        else{
            return res.status(status.ERROR).json({ 
                message: result.result || "Remove failed",
                details: result
            });
        }
    } catch(error) {
        console.error('Edit error:', error);
        return res.status(status.ERROR).json({ 
            message: "Internal server error", 
            details: error.message 
        });
    }

}

exports.activate_user = async (req, res) => {
    const { user_id, modified_by } = req.body;

    try{
        if( !user_id || modified_by === undefined || modified_by === null){
            return res.status(status.ERROR).json({
                message: "Some fields are empty",
                details: {
                    user_id: !!user_id,
                    modified_by: modified_by !== undefined && modified_by !== null
                }
            });
        }

        const result = await activate_user(user_id, modified_by);
        
        if(result.success === true){
            return res.status(status.OK).json({ message: result.result});
        }
        else{
            return res.status(status.ERROR).json({ 
                message: result.result || "Activate failed",
                details: result
            });
        }
    }
    catch(error){
        console.error('Activate error:', error);
        return res.status(status.ERROR).json({ 
            message: "Internal server error", 
            details: error.message 
        });
    }
}

