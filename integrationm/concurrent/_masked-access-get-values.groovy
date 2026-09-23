def instanceId = argsMap["instanceId"]
def maskedAccessFieldDefId = argsMap["maskedAccessFieldDefId"]
def maskedInfoFieldDefIds = argsMap["maskedInfoFieldDefIds"]

if (instanceId == null ||
        maskedAccessFieldDefId == null ||
        (maskedInfoFieldDefIds == null || maskedInfoFieldDefIds.isEmpty())) {
    return json(400, [error: "Missing required parameters"])
}

// When the array is only size 1 it's not detecting as a List
maskedInfoFieldDefIds = maskedInfoFieldDefIds instanceof List ? maskedInfoFieldDefIds : [maskedInfoFieldDefIds]

// The user must have access to the source instance in order for it to see secured information in the referred instance
def rmInstanceReadResult = recordm.get(instanceId, argsMap.user)
if (!rmInstanceReadResult.success()) {
    if (rmInstanceReadResult.getStatus() == 403) return json(403, ["error": "forbidden"])
    if (rmInstanceReadResult.getStatus() == 404) return json(404, ["error": "not found"])
}


def definitionResponse = recordm.getDefinition(rmInstanceReadResult.getBody().jsonDefinition.name)
def definition = definitionResponse.getBody()
if (definition == null) {
    return json(404, ["error": "Definition not found"])
}


// Only allows to get the fields
def sourceInstance = rmInstanceReadResult.getBody()
def instanceFields = sourceInstance.getFields()
def sourceField = findInstanceField(instanceFields, maskedAccessFieldDefId)
if (sourceField == null) {
    return json(404, ["error": "not found"])
}

def maskedFieldConfiguration = definition.getField(maskedAccessFieldDefId.toInteger()).getConfiguration()
if (maskedFieldConfiguration == null) {
    return json(404, ["error": "Masked field definition not found"])
}

def maskedAccessConf = maskedFieldConfiguration.getArgsFor("\$maskedAccess").args
def targetDefinition = maskedAccessConf?.get(0)
def targetField = maskedAccessConf?.get(1)

if (targetDefinition == null || targetField == null) {
    return json(400, ["error": "Bad configuration"])
}


// Exclude possible $restricted fields. If not in the source instance then we ignore
// Extract the target field from the configuration
def targetFieldsName = maskedInfoFieldDefIds.collect { fdId -> findInstanceField(instanceFields, fdId.toInteger()) }
        .findAll { it != null }
        .collect { it ->
            def fieldConf = definition.getField(it.fieldDefinition.id).getConfiguration()?.getArgsFor("\$maskedInfo")?.args ?: []
            return fieldConf[0]
        }

def values = [:]

def query = "${targetField.toLowerCase().replaceAll(" ", "_")}.raw:\"${instanceId}\""
def results = recordm.search(targetDefinition, query, [size: 1])
def referencedInstanceId = ""
if (results.getTotal() > 0) {
    def hit = results.getHits().get(0)
    referencedInstanceId = hit.getId()
    targetFieldsName.each { it -> values[it] = hit.value(it) }
}

// If the secured field group has a $restricted then the user must belong to one of the groups
def user = userm.getUser(argsMap.user).getBody()

def createResult = recordm.create("Masked Access Audit", [
        "Access Date"         : "${System.currentTimeMillis()}",
        "User"                : "${user._links.self}",
        "Source Instance"     : "${instanceId}",
        "Referred Instance"   : "${referencedInstanceId}",
        "Information Accessed": targetFieldsName.join("\n"),
])


if (createResult.success()) {
    def payload = [:]
    if (results.getTotal() > 0) {
        payload["values"] = values

        // Check if the user can edit the target instance.
        // If true, then the user should see a link in the UI that will send directly to the instance
        def referredInstanceResult = recordm.search(targetDefinition, query, [size: 1, runAs: argsMap.user])
        if (referredInstanceResult.getTotal() > 0 && referredInstanceResult.getHits().get(0).getRaw()._source._links.update != null) {
            payload["_targetInstanceId"] = referredInstanceResult.getHits().get(0).getId()
        }
    } else {
        // When not found any match, show a create link in the UI if the user can create instances in the target definition
        def definitionForUser = recordm.getDefinition(targetDefinition, argsMap.user)
        if (definitionForUser.success() && definitionForUser.getBody()._links.instantiate != null) {
            payload["_targetDefinitionId"] = definitionForUser.getBody().getId()
        }
    }

    return json(200, payload)

} else {
    return json(500, ["error": "Internal Server Error"])
}


def findInstanceField(fieldsList, fieldDefId) {
    for (int i = 0; i < fieldsList.size(); i++) {
        def field = fieldsList[i];
        if (field.fieldDefinition.id == fieldDefId) {
            return field
        }
    }

    return null
}